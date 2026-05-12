import React from "react";
import styles from "./toggle-switch.module.css";

interface ToggleSwitchProps {
  active: boolean;
  onChange: () => void;
  labelOff?: string;
  labelOn?: string;
  id?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  active,
  onChange,
  labelOff = "OFF",
  labelOn = "ON",
  id,
}) => {
  return (
    <div className={styles.toggleContainer}>
      <span className={styles.toggleLabel} data-active={!active}>{labelOff}</span>
      <button id={id} className={styles.toggleTrack} data-active={active} onClick={onChange}>
        <div className={styles.toggleThumb} data-active={active} />
      </button>
      <span className={styles.toggleLabel} data-active={active}>{labelOn}</span>
    </div>
  );
};
