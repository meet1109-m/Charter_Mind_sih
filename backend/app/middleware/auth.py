import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from firebase_admin import auth as firebase_auth
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.utils.firebase_admin import verify_id_token_async

logger = logging.getLogger("uvicorn.error")

# OAuth2 Bearer scheme with auto_error=False to return explicit 401 responses
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/verify-token", auto_error=False)


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Authenticate user using Firebase JWT ID token from Authorization header.
    
    Flow:
    1. Extracts Bearer token (auto_error=False) -> 401 "Not authenticated" if absent
    2. Runs async-safe token verification in thread pool executor
    3. Handles ExpiredIdTokenError, InvalidIdTokenError, RevokedIdTokenError
    4. Auto-provisions new User in PostgreSQL on initial login
    5. Returns persistent User ORM object
    """
    if not token:
        logger.warning("Authentication failed: Missing Authorization Bearer token header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Clean bearer prefix if passed manually
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    # Async-safe Firebase verification
    try:
        decoded_token = await verify_id_token_async(token)
    except firebase_auth.ExpiredIdTokenError:
        logger.warning("Authentication failed: Token has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired, please sign in again",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except firebase_auth.InvalidIdTokenError as err:
        logger.warning(f"Authentication failed: Invalid token ({err})")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except firebase_auth.RevokedIdTokenError:
        logger.warning("Authentication failed: Token has been revoked")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except HTTPException:
        raise
    except Exception as err:
        logger.error(f"Authentication failed: Unexpected error verifying token: {err}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )

    uid = decoded_token.get("uid") or decoded_token.get("sub")
    if not uid:
        logger.error("Authentication failed: Token missing 'uid' claim")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = decoded_token.get("email") or f"{uid}@maritime.local"
    name = decoded_token.get("name")
    avatar_url = decoded_token.get("picture") or decoded_token.get("photo_url")
    # Enforce database column width limits
    uid = str(uid)[:128]
    email = str(email)[:254]
    if avatar_url:
        avatar_url = str(avatar_url)[:512]

    # Query PostgreSQL database for user
    stmt = select(User).where(User.firebase_uid == uid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    # First login auto-registration or re-linking
    if user is None:
        # Check if user already exists by email
        if email:
            stmt_email = select(User).where(User.email == email)
            res_email = await db.execute(stmt_email)
            user = res_email.scalar_one_or_none()

        if user is not None:
            # Re-link existing user record to the current Firebase UID
            user.firebase_uid = uid
            if name and not user.name:
                user.name = name
            if avatar_url and not user.avatar_url:
                user.avatar_url = avatar_url
            await db.commit()
            await db.refresh(user)
            logger.info(f"Existing user account {user.email} re-linked to Firebase UID: {uid}")
        else:
            logger.info(f"First login detected for {email} (Firebase UID: {uid}). Auto-registering in PostgreSQL...")
            user = User(
                firebase_uid=uid,
                email=email,
                name=name or email.split("@")[0].replace(".", " ").title(),
                avatar_url=avatar_url,
                company="Maritime Logistics Corp",
                role="charterer",
                is_active=True,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            logger.info(f"User {user.email} successfully provisioned with ID {user.id}")
    else:
        logger.debug(f"Authenticated user: {user.email} (ID: {user.id})")

    if not user.is_active:
        logger.warning(f"Access denied for deactivated user account: {user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Please contact maritime system administrator.",
        )

    return user


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Optional authentication dependency that returns None if unauthenticated instead of raising 401."""
    if not token:
        return None
    try:
        return await get_current_user(token=token, db=db)
    except HTTPException:
        return None


# Backward-compatibility alias
get_optional_current_user = get_optional_user


def require_role(*allowed_roles: str):
    """Dependency factory ensuring authenticated user has one of the specified roles."""

    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == "admin":
            return current_user
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted for role '{current_user.role}'. Required: {allowed_roles}",
            )
        return current_user

    return role_checker
