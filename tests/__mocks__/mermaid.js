// Mock for mermaid
module.exports = {
  initialize: jest.fn(),
  render: jest.fn((id, definition) => {
    return Promise.resolve('mocked-svg');
  }),
  parse: jest.fn(),
  default: {
    initialize: jest.fn(),
    render: jest.fn((id, definition) => {
      return Promise.resolve('mocked-svg');
    }),
    parse: jest.fn(),
  },
};
