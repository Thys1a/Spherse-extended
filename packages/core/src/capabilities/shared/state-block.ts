export const STATE_BLOCK_TAG = "state";

export const STATE_BLOCK_PATTERN = new RegExp(
  `<${STATE_BLOCK_TAG}(\\s[^>]*)?>[\\s\\S]*?<\\/${STATE_BLOCK_TAG}>`,
  "g",
);
