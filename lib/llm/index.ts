export async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER ?? 'gemini'

  if (provider === 'gemini') {
    const { callGemini } = await import('./gemini')
    return callGemini(systemPrompt, userMessage)
  }

  throw new Error(`Unsupported LLM_PROVIDER: "${provider}". Supported: gemini`)
}
