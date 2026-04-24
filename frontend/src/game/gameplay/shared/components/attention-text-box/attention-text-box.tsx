import React from "react";
import styles from "./attention-text-box.module.css";

export const AttentionTextBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.attentionTextBox}>{children}</div>
);
