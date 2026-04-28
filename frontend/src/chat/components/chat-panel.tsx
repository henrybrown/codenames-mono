import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowDownIcon, ChatIcon } from "@frontend/shared/components/icons";
import { useGameMessages } from "../api/use-game-messages";
import { usePostMessage } from "../api/use-post-message";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import styles from "./chat-panel.module.css";

interface ChatPanelProps {
  gameId: string;
  /** Viewer's player publicId — used to render own messages on the right. */
  viewerPlayerId: string | null;
  open: boolean;
  onClose: () => void;
  /** When true, hide the input box (single-device mode = read-only chat). */
  readOnly?: boolean;
}

const panelVariants = {
  closed: { y: "100%", opacity: 0 },
  open: { y: 0, opacity: 1 },
};

const panelTransition = { duration: 0.35, ease: [0.32, 0.72, 0, 1] as const };

/**
 * Interactive chat panel. Always mounted — visibility toggled by `open`
 * via motion. Preserves scroll position and input draft across toggles.
 */
export const ChatPanel: React.FC<ChatPanelProps> = ({
  gameId,
  viewerPlayerId,
  open,
  onClose,
  readOnly = false,
}) => {
  const { data: messages } = useGameMessages(gameId);
  const postMessage = usePostMessage(gameId);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const handleSend = (content: string, teamOnly: boolean) => {
    postMessage.mutate({ content, teamOnly });
  };

  return (
    <motion.div
      className={styles.panel}
      variants={panelVariants}
      initial="closed"
      animate={open ? "open" : "closed"}
      transition={panelTransition}
      style={{ pointerEvents: open ? "auto" : "none" }}
      aria-hidden={!open}
    >
      <div className={styles.header}>
        <span className={styles.title}><ChatIcon /></span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Collapse chat"
        >
          <span className={styles.closeChevron}>
            <ArrowDownIcon />
          </span>
        </button>
      </div>

      <div ref={scrollRef} className={styles.messages}>
        {!messages || messages.length === 0 ? (
          <div className={styles.empty}>NO MESSAGES</div>
        ) : (
          messages.map((m) => (
            <ChatMessage
              key={m.id}
              playerName={m.playerName}
              teamName={m.teamName}
              content={m.content}
              messageType={m.messageType}
              isOwn={!!viewerPlayerId && m.playerId === viewerPlayerId}
            />
          ))
        )}
      </div>

      {!readOnly && <ChatInput onSend={handleSend} isLoading={postMessage.isPending} />}
    </motion.div>
  );
};
