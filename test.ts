// const url = "https://openrouter.ai/api/v1/parameters/xiaomi/mimo-v2-flash:free";
// const options = {
//   method: "GET",
//   headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
// };

import { getOllamaModelDetails } from "./src/services/llm";

// try {
//   const response = await fetch(url, options);
//   const data = await response.json();
//   console.log(data);
// } catch (error) {
//   console.error(error);
// }

// GROQ
// openai/gpt-oss-120b
//moonshotai/kimi-k2-instruct-0905

//"qwen2.context_length": 32768
//"general.parameter_count": 494032768,

//"general.architecture": "llama"
//"llama.context_length": 131072
getOllamaModelDetails("qwen2.5:0.5b").then((data) => console.log(data));
