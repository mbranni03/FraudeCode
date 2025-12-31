const generateIterationPrompt = (
  originalQuery: string,
  codeContext: string,
  currentPlan: string,
  feedback: string
) => `
You are an expert software engineer. Your task is to correct the base plan based on the user's change request.

### REFERENCE DATA
- **Original Goal:** ${originalQuery}
- **Code Context:** \`\`\`
${codeContext}
\`\`\`

### BASE PLAN
${currentPlan}

### CHANGE REQUEST
${feedback}

### INSTRUCTIONS FOR OUTPUT
1. Analyze which files need to be changed.
2. Formulate a step-by-step plan for the modifications.
3. Be precise about what logic needs to be updated.
4. Make the minimum number of changes possible.

Output your plan as a detailed technical specification. Begin immediately.
`;

export default generateIterationPrompt;
