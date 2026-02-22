/**
 * Browser stub for LangGraph
 * Extensions should not use LangGraph in browser environment
 */

export const graphStore = {
  getGraph: () => null,
  setGraph: () => {},
  hasGraph: () => false,
};

export class BaseGraph {
  constructor() {}
}

export const toolExecutor = {
  execute: async () => null,
};

export default {};
