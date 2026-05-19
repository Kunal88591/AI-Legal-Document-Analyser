module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(125, 211, 252, 0.12), 0 24px 80px rgba(15, 23, 42, 0.45)",
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at top left, rgba(56,189,248,0.22), transparent 35%), radial-gradient(circle at top right, rgba(34,197,94,0.14), transparent 30%), linear-gradient(180deg, #020617 0%, #07101f 52%, #020617 100%)",
      },
    },
  },
  plugins: [],
};