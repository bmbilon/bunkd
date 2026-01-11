interface PerplexityMessage {
  role: "system" | "user";
  content: string;
}

interface PerplexityRequest {
  model: string;
  messages: PerplexityMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface PerplexityResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class PerplexityProvider {
  private apiKey: string;
  private baseUrl = "https://api.perplexity.ai";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Perplexity API key is required");
    }
    this.apiKey = apiKey;
  }

  async analyze(systemPrompt: string, userContent: string): Promise<string> {
    const requestBody: PerplexityRequest = {
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Perplexity API error (${response.status}): ${errorText}`
      );
    }

    const data: PerplexityResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from Perplexity API");
    }

    return data.choices[0].message.content;
  }
}
