/**
 * IAs que o ArkoBot aceita hoje, conferidas nos drivers do app (server/drivers/).
 * Só entra aqui o que existe no código.
 */
export const gruposDeIA = [
  {
    titulo: 'Com a assinatura que você já tem',
    texto: 'Os bots usam o programa de IA instalado e logado no computador ou servidor, sem chave extra.',
    nomes: [
      'Claude (Claude Code)',
      'ChatGPT (Codex)',
      'Gemini',
      'GitHub Copilot',
      'Cursor',
      'Grok',
      'DeepSeek',
      'Kimi',
      'Qwen',
      'Factory Droid',
      'Kiro',
      'Cline',
      'OpenCode',
    ],
  },
  {
    titulo: 'Por chave de API',
    texto: 'Cole a chave do provedor e escolha o modelo de cada bot.',
    nomes: ['Grok (xAI)', 'Mistral', 'MiniMax', 'Meta Muse', 'Groq', 'Cerebras', 'OpenRouter', 'Greenference'],
  },
  {
    titulo: 'Modelos abertos e locais',
    texto: 'Rode modelos abertos no seu próprio servidor ou na sua rede, ou use qualquer API compatível com a da OpenAI.',
    nomes: ['Ollama', 'LM Studio', 'llama.cpp', 'Llama', 'GPT OSS', 'Qwen', 'Gemma', 'GLM'],
  },
] as const;

export const faixaDeIAs = [
  'Claude',
  'ChatGPT',
  'Gemini',
  'Grok',
  'DeepSeek',
  'GitHub Copilot',
  'Cursor',
  'Mistral',
  'Kimi',
  'Qwen',
  'Llama',
  'MiniMax',
  'Meta Muse',
  'Groq',
  'Cerebras',
  'OpenRouter',
  'Ollama',
  'LM Studio',
  'GPT OSS',
  'Gemma',
  'GLM',
];
