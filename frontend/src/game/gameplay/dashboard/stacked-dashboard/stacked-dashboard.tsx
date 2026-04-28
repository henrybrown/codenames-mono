import React, { useState } from "react";
import { useVisibilityContext, GAME_PANELS } from "../config";
import { PanelRenderer } from "../panel-renderer";
import { MiddleSection } from "../shared";
import { useGameDataRequired } from "../../providers";
import { ChatFab, ChatPanel } from "@frontend/chat/components";
import { useUnreadCount } from "@frontend/chat/api";
import { GAME_TYPE } from "@codenames/shared/types";
import type { PanelSlots } from "../config";
import styles from "./stacked-dashboard.module.css";

interface StackedDashboardProps {
  panels?: PanelSlots;
  isFetching?: boolean;
  /**
   * Namespaces Framer Motion layoutIds.
   * Must be unique per mounted instance if ever used in two places simultaneously.
   */
  instanceId?: string;
}

/**
 * Full stacked dashboard — all role-specific panels rendered vertically.
 * Used in: DesktopScene sidebar (landscape), MobileScene portrait drawer.
 */
export const StackedDashboard: React.FC<StackedDashboardProps> = ({
  panels = GAME_PANELS,
  isFetching = false,
  instanceId = "stacked",
}) => {
  const context = useVisibilityContext();
  const { gameData } = useGameDataRequired();
  const [chatOpen, setChatOpen] = useState(false);
  const unreadCount = useUnreadCount(gameData.publicId, chatOpen);

  return (
    <aside className={styles.sidebar}>
      {isFetching && <div className={styles.refetchIndicator} />}
      <div className={styles.inner}>
        <PanelRenderer
          panels={panels.header}
          context={context}
          slotId={`${instanceId}-header`}
        />
        <div className={styles.headerDivider} />
        <MiddleSection>
          <PanelRenderer
            panels={panels.middle}
            context={context}
            slotId={`${instanceId}-middle`}
          />
          <div className={styles.bottomSlot}>
            <PanelRenderer
              panels={panels.bottom}
              context={context}
              slotId={`${instanceId}-bottom`}
            />
          </div>
        </MiddleSection>
      </div>
      <div className={styles.chatFabSlot}>
        <ChatFab onClick={() => setChatOpen(true)} unreadCount={unreadCount} />
      </div>
      <ChatPanel
        gameId={gameData.publicId}
        viewerPlayerId={gameData.playerContext?.publicId ?? null}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        readOnly={gameData.gameType === GAME_TYPE.SINGLE_DEVICE}
      />
    </aside>
  );
};
