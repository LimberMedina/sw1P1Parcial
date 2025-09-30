export const TOKENS = {
  indigo: "#6366f1",
  slate: "#475569",
  black: "#000000",
  white: "#ffffff",
  headerStroke: "#6366f1",
};

// Tamaños compactos de clase
export const CLASS_SIZES = {
  WIDTH: 160,
  H_NAME: 28,
  H_ATTRS: 32,
  H_METHODS: 40,
  get HEIGHT() {
    return this.H_NAME + this.H_ATTRS + this.H_METHODS;
  },
};
