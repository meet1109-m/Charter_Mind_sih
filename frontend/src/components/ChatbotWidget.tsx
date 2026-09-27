import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Trash2, 
  Minimize2, 
  Maximize2, 
  AlertCircle, 
  Anchor, 
  RefreshCw,
  HelpCircle
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  "What is the Baltic Dry Index (BDI)?",
  "How does voyage risk scoring work?",
  "Where can I see live port congestion for Paradip?",
  "What is the difference between Capesize and Panamax?"
];

export const ChatbotWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: "👋 Welcome to **CharterMind**! I can explain maritime concepts, definitions, and guide you to the right platform page for live rates, port congestion, and risk analytics.",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) {
      setInputMessage('');
    }
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const endpoint = `${apiBase.replace(/\/$/, '')}/chatbot/message`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit reached (max 10 requests per minute). Please wait a moment.');
        }
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Unable to connect to maritime AI assistant.');
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: data.reply || 'No response returned from the model.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'assistant',
        text: "👋 Chat reset. How can I assist your maritime chartering operations today?",
        timestamp: new Date(),
      },
    ]);
    setErrorMessage(null);
  };

  // Basic Markdown-like formatting helper for AI replies
  const renderFormattedText = (content: string) => {
    const lines = content.split('\n');
    return (
      <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed">
        {lines.map((line, idx) => {
          if (line.startsWith('### ')) {
            return (
              <h4 key={idx} className="font-bold text-slate-900 pt-1 text-xs sm:text-sm">
                {line.replace('### ', '')}
              </h4>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h3 key={idx} className="font-bold text-slate-900 pt-1.5 text-sm">
                {line.replace('## ', '')}
              </h3>
            );
          }
          if (line.startsWith('* ') || line.startsWith('- ')) {
            const itemText = line.substring(2);
            return (
              <div key={idx} className="flex items-start gap-1.5 pl-1.5">
                <span className="text-sky-500 font-bold">•</span>
                <span>{renderInlineStyles(itemText)}</span>
              </div>
            );
          }
          if (line.trim() === '') {
            return <div key={idx} className="h-1" />;
          }
          return <p key={idx}>{renderInlineStyles(line)}</p>;
        })}
      </div>
    );
  };

  const renderInlineStyles = (text: string) => {
    // Process bold **text**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans print:hidden">
      {/* 1. Closed State Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#0F2942] to-[#1E3A8A] text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 border border-sky-400/30 cursor-pointer"
          title="Open CharterMind Maritime AI Assistant"
        >
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-300">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="text-left pr-1">
            <div className="text-xs font-bold tracking-wide uppercase text-sky-200 flex items-center gap-1">
              <span>CharterMind AI</span>
              <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
            </div>
            <div className="text-[11px] text-slate-300 font-normal">Maritime Charter Copilot</div>
          </div>
        </button>
      )}

      {/* 2. Open Chat Window */}
      {isOpen && (
        <div
          className={`bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden transition-all duration-200 ${
            isExpanded
              ? 'w-[95vw] sm:w-[580px] h-[85vh] max-h-[800px]'
              : 'w-[92vw] sm:w-[410px] h-[560px] max-h-[80vh]'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0F2942] via-[#1A365D] to-[#1E3A8A] px-4 py-3.5 text-white flex items-center justify-between shadow-sm select-none">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shadow-inner">
                <Anchor className="w-4 h-4" />
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-400 rounded-full ring-1 ring-[#0F2942]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-tight text-white">CharterMind AI</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-sky-500/20 border border-sky-400/30 text-sky-200 rounded font-medium">
                    Copilot
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 flex items-center gap-1">
                  <span>Dry Bulk Intelligence & Advisory</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="Clear conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer hidden sm:block"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-rose-50 border-b border-rose-200 px-3.5 py-2 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span className="flex-1">{errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-rose-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-full bg-slate-800 text-sky-400 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                      isUser
                        ? 'bg-[#0284C7] text-white rounded-br-xs'
                        : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                        {msg.text}
                      </p>
                    ) : (
                      renderFormattedText(msg.text)
                    )}

                    <div
                      className={`text-[9px] mt-1.5 text-right font-mono ${
                        isUser ? 'text-sky-100/80' : 'text-slate-400'
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI Loading Bubble */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="w-7 h-7 rounded-full bg-slate-800 text-sky-400 flex items-center justify-center shrink-0 shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-xs shadow-xs flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">
                    Consulting maritime intelligence...
                  </span>
                </div>
              </div>
            )}

            {/* Starter Suggestion Pills (when chat is short) */}
            {messages.length <= 2 && !isLoading && (
              <div className="pt-2">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  <HelpCircle className="w-3 h-3 text-sky-600" />
                  <span>Suggested Maritime Questions</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {QUICK_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(prompt)}
                      className="text-left text-xs bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-800 border border-slate-200/80 hover:border-sky-200 rounded-xl px-3 py-2 transition-colors cursor-pointer shadow-2xs"
                    >
                      💡 {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Form */}
          <div className="p-3 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about fixtures, draughts, BDI rates..."
                rows={1}
                maxLength={2000}
                disabled={isLoading}
                className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 max-h-24 min-h-[42px] transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="h-[42px] px-3.5 bg-gradient-to-r from-[#0F2942] to-[#0284C7] hover:from-[#1A365D] hover:to-[#0369A1] text-white rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-slate-400">
              <span>Press Enter to send • Shift+Enter for new line</span>
              <span>10 req/min rate protected</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
