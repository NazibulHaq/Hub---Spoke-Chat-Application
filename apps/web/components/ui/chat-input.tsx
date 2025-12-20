import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void; // Keeping compatible with event types
    onSend: (content: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function ChatInput({ value, onChange, onSend, placeholder, className, disabled }: ChatInputProps) {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Auto-resize logic
    React.useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) {
                onSend(value);
            }
        }
    };

    // Adapter for onChange to match existing usage if necessary, 
    // but the parent passes `handleInput` which expects ChangeEvent<HTMLInputElement>.
    // effectively Textarea ChangeEvent is compatible if we cast or parent accepts it.

    return (
        <div className={cn("flex gap-2 items-end w-full", className)}>
            <div className="relative flex-1">
                <Textarea
                    ref={textareaRef}
                    value={value}
                    onChange={onChange as any} // Cast to satisfy strict type request from parent if mismatch
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="min-h-[44px] max-h-[150px] resize-none py-3 pr-12 scrollbar-hide overflow-y-auto w-full rounded-2xl border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                    disabled={disabled}
                    rows={1}
                />
            </div>
            <Button
                onClick={() => onSend(value)}
                disabled={disabled || !value.trim()}
                className="rounded-full h-11 w-11 p-0 shrink-0 mb-[1px]" // Align with bottom of textarea
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            </Button>
        </div>
    );
}
