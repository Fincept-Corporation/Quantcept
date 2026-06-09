/**
 * Home-screen tips. One short, plain-language line each — written for a non-technical
 * reader and covering both "what you can do" and the simple "how". The Prompt rotates
 * through these while the input is idle (see components/prompt). Keep each tip a single
 * line and short (the tip test enforces this); every command/key here is real.
 */
export const TIPS: readonly string[] = [
  // Getting started
  'Just ask in plain English — like "How did Tesla do last quarter?"',
  "Type /help anytime to see everything I can do.",
  "Press Ctrl+P to search every command in one place.",
  "Press ↑ to bring back a message you typed before.",
  "Press Enter to send, Shift+Enter for a new line.",
  "Press Esc to close any popup or menu.",

  // Experts / agents
  "Press Tab to switch experts — Analyst, Trader, Risk Manager & more.",
  "Want a custom expert? Type /create-agent to build one together.",
  "Don't need a custom expert anymore? Type /delete-agent to remove it.",

  // Asking about markets & companies
  "Ask for any public company's revenue, profit, or cash flow.",
  "Compare two companies — just name both and ask.",
  "Ask for a stock's price over the past year.",
  "Ask me to calculate the Sharpe ratio of your portfolio.",
  'Ask "What are today\'s top gainers?" for a quick market pulse.',
  'Ask "What\'s the risk in my portfolio?" for a simple risk check.',
  "New to a term? Ask \"What's a P/E ratio?\" — I'll keep it simple.",
  "Ask me to break a big task into steps, then work through them.",

  // Your stuff & getting around
  "Type /positions to track your holdings and portfolio.",
  "I remember key facts between chats — type /memory to see them.",
  "Press Ctrl+Y to copy my last reply.",
  "Type /new to start a fresh conversation anytime.",
  "Type /resume to pick up a past conversation.",
  "Made a wrong turn? Type /undo to step back.",
  "Type /checkpoints to jump back to an earlier point.",
  "Type /jobs to run longer tasks in the background.",
  "Type /skills for ready-made tasks you can run in one step.",
  "Type /theme to change the look (dark, light & more).",
  "Type /account to manage your account and credits.",
  "Press Shift+Tab to let me act automatically (toggle off anytime).",

  // Extend & sync
  "Add more tools and data sources with /plugins.",
  "Type /cloud to sync your work across devices.",
  "Type /learnings to revisit insights saved from past work.",
  "Power user? Type /mcp to connect external tool servers.",
]
