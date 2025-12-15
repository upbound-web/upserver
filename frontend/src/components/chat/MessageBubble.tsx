import { type Message, getImageUrl } from "@/lib/chat-api";
import { cn } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import { AlertCircle } from "lucide-react";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isCustomer = message.role === "customer";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="px-3 py-1 bg-stone-100 dark:bg-stone-800 rounded-full text-xs text-stone-600 dark:text-stone-400">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full mb-4",
        isCustomer ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 shadow-sm",
          isCustomer
            ? "bg-primary text-primary-foreground"
            : "bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
        )}
      >
        {message.flagged && (
          <div className="flex items-center gap-1 mb-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" />
            <span>Flagged for review</span>
          </div>
        )}
        {/* Display images if present */}
        {message.images && (
          <div className="mb-2 flex flex-wrap gap-2">
            {(() => {
              try {
                const imagePaths =
                  typeof message.images === "string"
                    ? JSON.parse(message.images)
                    : message.images;
                if (Array.isArray(imagePaths)) {
                  return imagePaths.map((path: string, index: number) => {
                    const imageUrl = getImageUrl(path);
                    return (
                      <img
                        key={index}
                        src={imageUrl}
                        alt={`Uploaded image ${index + 1}`}
                        className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-stone-200 dark:border-stone-700"
                        onError={(e) => {
                          // Fallback if image fails to load
                          console.error("Failed to load image:", path);
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    );
                  });
                }
              } catch (e) {
                return null;
              }
            })()}
          </div>
        )}
        <div className="break-words [&_p]:my-1 [&_ul]:my-2 [&_ol]:my-2 [&_code]:bg-black/10 [&_code]:dark:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_strong]:font-semibold [&_em]:italic">
          <Markdown content={message.content} />
        </div>
        <div
          className={cn(
            "text-xs mt-1",
            isCustomer
              ? "text-primary-foreground/70"
              : "text-stone-500 dark:text-stone-400"
          )}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
