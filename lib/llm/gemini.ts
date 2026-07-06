import { GoogleGenAI } from '@google/genai'

export async function callGemini(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set')

  const modelName = process.env.LLM_MODEL ?? 'gemini-2.5-flash'
  const temperature = parseFloat(process.env.LLM_TEMPERATURE ?? '0.1')

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: modelName,
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
      temperature,
    },
  })

  const text = response.text
  if (text === undefined) throw new Error('LLM returned empty response')
  return text
}
