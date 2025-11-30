// Mock for react-syntax-highlighter
const React = require('react');

const SyntaxHighlighter = React.forwardRef(({ children, language, ...props }, ref) => {
  return React.createElement('pre', { ref, ...props }, children);
});
SyntaxHighlighter.displayName = 'SyntaxHighlighter';

module.exports = {
  Prism: SyntaxHighlighter,
  default: SyntaxHighlighter,
};

// Mock styles
module.exports['react-syntax-highlighter/dist/esm/styles/prism'] = {
  oneDark: {},
  oneLight: {},
};
