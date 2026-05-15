import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  basePromptEn: string;
  basePromptZh: string;
  shots: {
    type: string;
    charactersEn?: string;
    charactersZh?: string;
    sceneEn?: string;
    sceneZh?: string;
    cameraMovementEn: string;
    cameraMovementZh: string;
    duration: string;
    descriptionEn: string;
    descriptionZh: string;
  }[];
}

export async function analyzeImages(base64Images: string[], userRequirements?: string): Promise<AnalysisResult> {
  const model = "gemini-3.1-pro-preview";
  
  const parts: any[] = [];
  base64Images.forEach((img, index) => {
    // Extract actual mime type from base64 string (e.g., "data:image/png;base64,...")
    const mimeTypeMatch = img.match(/data:(.*?);base64/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
    
    parts.push({ text: `Reference Image ${index + 1}:` });
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: img.split(",")[1]
      }
    });
  });

  const prompt = `
<role>
你是一位获奖预告片导演＋摄影师+故事板艺术家。你的工作：将单张或多张参考图转化为连贯的电影级短镜头序列，然后输出适用于AI视频生成的关键帧。
</role>

<non-negotiable rules - continuity & truthfulness>
1）首先，分析完整构图：识别所有核心主体（人物/群体/车辆/物体/动物/道具/环境元素），并描述空间关系与互动（左/右/前景/背景、朝向、各主体动作）。
2）不得猜测真实身份、确切现实地点或品牌归属权。仅基于可见事实。允许推断氛围/情绪，但严禁作为现实真相呈现。
3）所有镜头保持严格连贯性：相同主体、相同服装/外观、相同环境、相同时段与光影风格。仅可改变动作、表情、走位、取景、角度及镜头运动。
4）景深需符合现实逻辑：广角镜头景深更深，特写镜头景深更浅且带有自然焦外虚化。全序列采用统一的电影级调色风格。
5）不得引入参考图中未出现的新角色/物体。若需营造张力/悬念，可通过画外元素暗示（影子、声音、反射、遮挡、凝视）。
6）强制图像引用：在生成的“基础场景描述”和“9个关键帧描述”中，如果涉及特定图像中的人物、物体或环境，必须明确标注来源（例如英文使用 "[Image 1]", "[Image 2]"，中文使用 "[图1]", "[图2]"）。
</non-negotiable rules>

<goal>
将图像扩展为10-20秒的电影级片段，具备清晰主题与情绪递进（铺垫—升级—转折—收尾）。
</goal>

<user_specific_requirements>
附加用户需求：${userRequirements || "无附加要求。请专注分析提供的图像。"}
注：用户可能会提到“图1”、“图2”等，这对应于你接收到的图片顺序。请严格执行用户的附加需求。
</user_specific_requirements>

<execution_steps>
第一步-场景拆解：主体、环境与光影、视觉锚点。
第二步-主题与故事：主题、剧情梗概、情绪弧线（4个节点）。
第三步-电影化表现手法：镜头递进策略、镜头运动方案、镜头与曝光建议、光影与色彩。
第四步-AI视频关键帧：生成刚好 9 个关键帧（为了适配我们的3x3 UI网格）。包含构图、动作/节点、镜头、镜头/景深、光影与调色、声音/氛围。必须包含：1个环境建立广角镜头、1个近距离特写镜头、1个极致细节大特写镜头、1个视觉冲击力镜头。同时，为每个镜头提供具体的运镜建议（如 Pan left, Zoom in, Tracking shot）和推荐时长（如 3s, 5s）。
</execution_steps>

<final_output_format>
You MUST return the result strictly as a JSON object matching the requested schema. Return ONLY valid JSON. Do not include markdown formatting like \`\`\`json.
- "basePromptEn" (string): English translation of your combined Step 1, Step 2, and Step 3. MUST include references like [Image 1] if applicable.
- "basePromptZh" (string): Chinese version of your combined Step 1, Step 2, and Step 3. MUST include references like [图1] if applicable.
- "shots" (array of exactly 9 objects): Your Step 4 keyframes. For each shot:
    - "type" (string): The cinematic shot type (e.g., "Wide Shot", "Close Up").
    - "cameraMovementEn" (string): Camera movement in English (e.g., "Slow pan right").
    - "cameraMovementZh" (string): Camera movement in Chinese (e.g., "缓慢向右横摇").
    - "duration" (string): Suggested duration (e.g., "3s", "5s").
    - "descriptionEn" (string): English detailed description of the frame (Composition, Action, Camera, DoF, Lighting, Sound). MUST include references like [Image 1] if applicable.
    - "descriptionZh" (string): Chinese detailed description of the frame. MUST include references like [图1] if applicable.
</final_output_format>
`;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out after 180 seconds. The AI is analyzing the images, which can take a bit longer.")), 180000);
  });

  const response: GenerateContentResponse = await Promise.race([
    ai.models.generateContent({
      model,
      contents: { parts: [...parts, { text: prompt }] },
      config: {
        responseMimeType: "application/json"
      }
    }),
    timeoutPromise
  ]);

  try {
    let text = response.text || "{}";
    
    // Extract JSON block if there's extra text before or after
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
      text = text.substring(startIdx, endIdx + 1);
    }
    
    const parsed = JSON.parse(text);
    
    // Ensure all required fields exist with defaults if missing
    return {
      basePromptEn: parsed.basePromptEn || "Failed to generate base prompt.",
      basePromptZh: parsed.basePromptZh || "生成基础描述失败。",
      shots: (parsed.shots || []).map((s: any, i: number) => ({
        type: s.type || "Medium Shot",
        cameraMovementEn: s.cameraMovementEn || "Static",
        cameraMovementZh: s.cameraMovementZh || "固定镜头",
        duration: s.duration || "3s",
        descriptionEn: s.descriptionEn || `Shot ${i + 1} description missing.`,
        descriptionZh: s.descriptionZh || `第 ${i + 1} 镜描述缺失。`
      }))
    } as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse AI response:", e, response.text);
    throw new Error("AI generated an invalid format or timed out. Please try again.");
  }
}

export async function generateScript(plot: string, userRequirements?: string): Promise<AnalysisResult> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `
<role>
你是一位获奖预告片导演＋编剧。你的工作：将用户提供的剧情转化为一系列适用于AI视频生成的15秒视频脚本（Shot）。
因为AI视频生成工具（如Sora, Kling等）单次生成的最大时长通常为15秒，所以你需要将整个故事拆分为若干个15秒的视频片段。
</role>

<plot>
${plot}
</plot>

<non-negotiable rules>
1）根据剧情的长度和需要，将故事拆分为若干个连贯的视频片段（Shot）。片段的数量取决于故事的长度。
2）**每个视频片段（Shot）的固定总时长必须严格为 15 秒**。
3）在每个15秒片段的描述中，必须包含详细的时间轴拆解（例如：0s-5s: 角色走进画面，镜头缓慢推进；5s-10s: 角色停下四处张望；10s-15s: 镜头特写角色惊讶的表情）。
4）保持角色、环境和光影在所有片段中的一致性。
</non-negotiable rules>

<user_specific_requirements>
附加用户需求：${userRequirements || "无附加要求。"}
</user_specific_requirements>

<final_output_format>
You MUST return the result strictly as a JSON object matching the requested schema. Return ONLY valid JSON. Do not include markdown formatting like \`\`\`json.
- "basePromptEn" (string): English translation of the overall scene/plot summary.
- "basePromptZh" (string): Chinese version of the overall scene/plot summary.
- "shots" (array of objects, number of objects depends on the story length):
    - "type" (string): The cinematic shot type (e.g., "Wide Shot", "Close Up").
    - "charactersEn" (string): Characters appearing in this clip in English (e.g., "A young woman in a red coat").
    - "charactersZh" (string): Characters appearing in this clip in Chinese.
    - "sceneEn" (string): The setting/scene of this clip in English (e.g., "A rainy cyberpunk street").
    - "sceneZh" (string): The setting/scene of this clip in Chinese.
    - "cameraMovementEn" (string): Camera movement in English (e.g., "Slow pan right").
    - "cameraMovementZh" (string): Camera movement in Chinese (e.g., "缓慢向右横摇").
    - "duration" (string): MUST be exactly "15s".
    - "descriptionEn" (string): English detailed description of the 15s clip, MUST include the timeline breakdown (e.g., "0s-5s: ..., 5s-10s: ..., 10s-15s: ...").
    - "descriptionZh" (string): Chinese detailed description of the 15s clip, MUST include the timeline breakdown (e.g., "0s-5s: ..., 5s-10s: ..., 10s-15s: ...").
</final_output_format>
`;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out after 180 seconds.")), 180000);
  });

  let response: GenerateContentResponse | null = null;
  let retries = 2;
  let lastError: any = null;

  while (retries > 0) {
    try {
      response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: { parts: [{ text: prompt }] },
          config: {
            responseMimeType: "application/json"
          }
        }),
        timeoutPromise
      ]);
      break; // Success
    } catch (e) {
      console.warn(`API call failed, retrying... (${retries} left)`, e);
      lastError = e;
      retries--;
      if (retries === 0) {
        throw new Error(`AI API Error: ${lastError?.message || 'Unknown error'}. Please try again or shorten the plot.`);
      }
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!response) {
    throw new Error("Failed to get response from AI.");
  }

  try {
    let text = response.text || "{}";
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
      text = text.substring(startIdx, endIdx + 1);
    }
    const parsed = JSON.parse(text);
    return {
      basePromptEn: parsed.basePromptEn || "Failed to generate base prompt.",
      basePromptZh: parsed.basePromptZh || "生成基础描述失败。",
      shots: (parsed.shots || []).map((s: any, i: number) => ({
        type: s.type || "Medium Shot",
        charactersEn: s.charactersEn || "",
        charactersZh: s.charactersZh || "",
        sceneEn: s.sceneEn || "",
        sceneZh: s.sceneZh || "",
        cameraMovementEn: s.cameraMovementEn || "Static",
        cameraMovementZh: s.cameraMovementZh || "固定镜头",
        duration: s.duration || "15s",
        descriptionEn: s.descriptionEn || `Shot ${i + 1} description missing.`,
        descriptionZh: s.descriptionZh || `第 ${i + 1} 镜描述缺失。`
      }))
    } as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse AI response:", e, response.text);
    throw new Error("AI generated an invalid format or timed out. Please try again.");
  }
}

export async function analyzeSplitImages(base64Images: string[], userRequirements?: string): Promise<AnalysisResult> {
  const model = "gemini-3.1-pro-preview";
  
  const parts: any[] = [];
  base64Images.forEach((img, index) => {
    const mimeTypeMatch = img.match(/data:(.*?);base64/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
    
    parts.push({ text: `Panel ${index + 1}:` });
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: img.split(",")[1]
      }
    });
  });

  const prompt = `
<role>
你是一位获奖预告片导演＋摄影师+故事板艺术家。你的工作：分析提供的一组（通常是9张）分镜图，为每一张图生成适用于AI视频生成的关键帧描述和运镜提示词。
</role>

<non-negotiable rules>
1）你将收到多张按顺序排列的分镜图（Panel 1对应第1镜，Panel 2对应第2镜，以此类推）。
2）针对每一张图，分析其构图、主体动作、环境、光影等。
3）为每一张图生成具体的运镜建议（如 Pan left, Zoom in）和推荐时长（如 3s, 5s）。
4）必须严格按照提供的图片顺序，生成对应数量的关键帧描述。
</non-negotiable rules>

<user_specific_requirements>
附加用户需求：${userRequirements || "无附加要求。请专注分析提供的图像。"}
</user_specific_requirements>

<final_output_format>
You MUST return the result strictly as a JSON object matching the requested schema. Return ONLY valid JSON. Do not include markdown formatting like \`\`\`json.
- "basePromptEn" (string): English translation of the overall scene summary.
- "basePromptZh" (string): Chinese version of the overall scene summary.
- "shots" (array of exactly ${base64Images.length} objects, one for each provided image in order):
    - "type" (string): The cinematic shot type (e.g., "Wide Shot", "Close Up").
    - "cameraMovementEn" (string): Camera movement in English (e.g., "Slow pan right").
    - "cameraMovementZh" (string): Camera movement in Chinese (e.g., "缓慢向右横摇").
    - "duration" (string): Suggested duration (e.g., "3s", "5s").
    - "descriptionEn" (string): English detailed description of the frame (Composition, Action, Camera, DoF, Lighting, Sound).
    - "descriptionZh" (string): Chinese detailed description of the frame.
</final_output_format>
`;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out after 180 seconds.")), 180000);
  });

  const response: GenerateContentResponse = await Promise.race([
    ai.models.generateContent({
      model,
      contents: { parts: [...parts, { text: prompt }] },
      config: {
        responseMimeType: "application/json"
      }
    }),
    timeoutPromise
  ]);

  try {
    let text = response.text || "{}";
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
      text = text.substring(startIdx, endIdx + 1);
    }
    const parsed = JSON.parse(text);
    return {
      basePromptEn: parsed.basePromptEn || "Failed to generate base prompt.",
      basePromptZh: parsed.basePromptZh || "生成基础描述失败。",
      shots: (parsed.shots || []).map((s: any, i: number) => ({
        type: s.type || "Medium Shot",
        cameraMovementEn: s.cameraMovementEn || "Static",
        cameraMovementZh: s.cameraMovementZh || "固定镜头",
        duration: s.duration || "3s",
        descriptionEn: s.descriptionEn || `Shot ${i + 1} description missing.`,
        descriptionZh: s.descriptionZh || `第 ${i + 1} 镜描述缺失。`
      }))
    } as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse AI response:", e, response.text);
    throw new Error("AI generated an invalid format or timed out. Please try again.");
  }
}
