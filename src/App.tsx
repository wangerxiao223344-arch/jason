/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  Image as ImageIcon, 
  X, 
  Loader2, 
  Copy, 
  Check, 
  Languages, 
  Camera, 
  LayoutGrid,
  RefreshCw,
  ChevronDown,
  Video,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeImages, analyzeSplitImages, generateScript } from './services/geminiService';
import { cn } from './lib/utils';
import ImageSplitter from './components/ImageSplitter';

const SHOT_TYPES = [
  { id: 'ecu', label: '特写 (Extreme Close Up)', en: 'Extreme Close Up' },
  { id: 'cu', label: '近景 (Close Up)', en: 'Close Up' },
  { id: 'mcu', label: '中近景 (Medium Close Up)', en: 'Medium Close Up' },
  { id: 'ms', label: '中景 (Medium Shot)', en: 'Medium Shot' },
  { id: 'mws', label: '中远景 (Medium Wide Shot)', en: 'Medium Wide Shot' },
  { id: 'ws', label: '远景 (Wide Shot)', en: 'Wide Shot' },
  { id: 'es', label: '大全景 (Extreme Wide Shot)', en: 'Extreme Wide Shot' },
  { id: 'bev', label: '鸟瞰 (Bird\'s Eye View)', en: 'Bird\'s Eye View' },
  { id: 'low', label: '仰拍 (Low Angle)', en: 'Low Angle' },
  { id: 'high', label: '俯拍 (High Angle)', en: 'High Angle' },
  { id: 'ots', label: '过肩拍 (Over the Shoulder)', en: 'Over the Shoulder' },
];

interface ShotConfig {
  type: string;
  charactersEn: string;
  charactersZh: string;
  sceneEn: string;
  sceneZh: string;
  cameraMovementEn: string;
  cameraMovementZh: string;
  duration: string;
  descriptionEn: string;
  descriptionZh: string;
}

export default function App() {
  const [images, setImages] = useState<string[]>([]);
  const [userRequirements, setUserRequirements] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [basePrompt, setBasePrompt] = useState({ en: '', zh: '' });
  const [shots, setShots] = useState<ShotConfig[]>(
    Array(9).fill(null).map(() => ({ 
      type: SHOT_TYPES[3].en, 
      charactersEn: '',
      charactersZh: '',
      sceneEn: '',
      sceneZh: '',
      cameraMovementEn: '', 
      cameraMovementZh: '', 
      duration: '', 
      descriptionEn: '', 
      descriptionZh: '' 
    }))
  );
  const [lang, setLang] = useState<'zh' | 'en'>('en');
  const [copied, setCopied] = useState(false);
  const [finalPrompt, setFinalPrompt] = useState({ zh: '', en: '' });
  const [activeTab, setActiveTab] = useState<'storyboard' | 'splitter' | 'script'>('storyboard');
  const [outputMode, setOutputMode] = useState<'grid' | 'video'>('grid');
  const [plot, setPlot] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (images.length + acceptedFiles.length > 9) {
      setError('You can only upload up to 9 images in total.');
      return;
    }
    setError(null);
    setOutputMode('grid');
    
    acceptedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
            setImages(prev => {
              if (prev.length >= 9) return prev; // Double check to prevent race conditions
              return [...prev, compressedBase64];
            });
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, [images.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxFiles: 5,
    multiple: true
  } as any);

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const handleAnalyze = async () => {
    if (images.length === 0 && !userRequirements) {
      setError('Please upload images or provide requirements.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeImages(images, userRequirements);
      setBasePrompt({ en: result.basePromptEn, zh: result.basePromptZh });
      if (result.shots && result.shots.length === 9) {
        setShots(result.shots.map(s => ({
          type: s.type,
          charactersEn: s.charactersEn || '',
          charactersZh: s.charactersZh || '',
          sceneEn: s.sceneEn || '',
          sceneZh: s.sceneZh || '',
          cameraMovementEn: s.cameraMovementEn,
          cameraMovementZh: s.cameraMovementZh,
          duration: s.duration,
          descriptionEn: s.descriptionEn,
          descriptionZh: s.descriptionZh
        })));
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error?.message || 'Unknown error occurred';
      setError(`Analysis failed: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeSplit = async (splitImages: string[]) => {
    setImages(splitImages);
    setActiveTab('storyboard');
    setOutputMode('video');
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeSplitImages(splitImages, userRequirements);
      setBasePrompt({ en: result.basePromptEn, zh: result.basePromptZh });
      if (result.shots && result.shots.length === splitImages.length) {
        setShots(result.shots.map(s => ({
          type: s.type,
          charactersEn: s.charactersEn || '',
          charactersZh: s.charactersZh || '',
          sceneEn: s.sceneEn || '',
          sceneZh: s.sceneZh || '',
          cameraMovementEn: s.cameraMovementEn,
          cameraMovementZh: s.cameraMovementZh,
          duration: s.duration,
          descriptionEn: s.descriptionEn,
          descriptionZh: s.descriptionZh
        })));
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error?.message || 'Unknown error occurred';
      setError(`Analysis failed: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!plot.trim()) {
      setError('Please provide a plot or story.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setOutputMode('video');
    try {
      const result = await generateScript(plot, userRequirements);
      setBasePrompt({ en: result.basePromptEn, zh: result.basePromptZh });
      if (result.shots && result.shots.length > 0) {
        setShots(result.shots.map(s => ({
          type: s.type,
          charactersEn: s.charactersEn || '',
          charactersZh: s.charactersZh || '',
          sceneEn: s.sceneEn || '',
          sceneZh: s.sceneZh || '',
          cameraMovementEn: s.cameraMovementEn,
          cameraMovementZh: s.cameraMovementZh,
          duration: s.duration,
          descriptionEn: s.descriptionEn,
          descriptionZh: s.descriptionZh
        })));
      }
    } catch (error: any) {
      console.error(error);
      let errorMessage = error?.message || 'Unknown error occurred';
      if (errorMessage.includes('Rpc failed') || errorMessage.includes('xhr error')) {
        errorMessage = 'Network or API error occurred. The story might be too long or the server is busy. Please try again or shorten the plot.';
      }
      setError(`Script generation failed: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateShot = (index: number, field: keyof ShotConfig, value: string) => {
    const newShots = [...shots];
    newShots[index] = { ...newShots[index], [field]: value };
    setShots(newShots);
  };

  const generateFinalPrompt = useCallback(() => {
    const currentBaseEn = basePrompt.en || "A cinematic scene with consistent lighting and atmosphere";
    const currentBaseZh = basePrompt.zh || "一个具有一致光影和氛围的电影场景";

    let enTemplate = "";
    let zhTemplate = "";

    if (outputMode === 'video') {
      const isScript = activeTab === 'script';
      const enPrefix = isScript ? 'Clip' : 'Panel';
      const zhPrefix = isScript ? '片段' : '画面';

      enTemplate = `Video Generation Prompts for each ${enPrefix.toLowerCase()} based on the overall scene: [${currentBaseEn}]\n\n` +
        shots.map((s, i) => {
          let details = `${enPrefix} ${String(i + 1).padStart(2, '0')}: ${s.type}`;
          if (s.charactersEn) details += ` | Characters: ${s.charactersEn}`;
          if (s.sceneEn) details += ` | Scene: ${s.sceneEn}`;
          if (s.descriptionEn) details += ` - ${s.descriptionEn}`;
          details += ` | Camera: ${s.cameraMovementEn} | Duration: ${s.duration}`;
          return details;
        }).join('\n\n');
      
      zhTemplate = `基于整体场景的各${zhPrefix}视频生成提示词：[${currentBaseZh}]\n\n` +
        shots.map((s, i) => {
          const shotType = SHOT_TYPES.find(t => t.en === s.type || t.label.includes(s.type));
          let details = `${zhPrefix} ${String(i + 1).padStart(2, '0')}：${shotType?.label || s.type}`;
          if (s.charactersZh) details += ` | 角色: ${s.charactersZh}`;
          if (s.sceneZh) details += ` | 场景: ${s.sceneZh}`;
          if (s.descriptionZh) details += ` - ${s.descriptionZh}`;
          details += ` | 运镜: ${s.cameraMovementZh} | 时长: ${s.duration}`;
          return details;
        }).join('\n\n');
    } else {
      enTemplate = `Based on [${currentBaseEn}], generate a cohesive [3x3] grid image, containing [9] different camera shots in the same environment, strictly maintaining consistency of characters/objects, clothing, and lighting, [8K] resolution, [16:9] aspect ratio. IMPORTANT: Clearly overlay the corresponding number (1 to 9) in the top right corner of each grid panel.\n\n` +
        shots.map((s, i) => {
          let details = `Shot ${String(i + 1).padStart(2, '0')}: ${s.type}`;
          if (s.charactersEn) details += ` | Characters: ${s.charactersEn}`;
          if (s.sceneEn) details += ` | Scene: ${s.sceneEn}`;
          if (s.descriptionEn) details += ` - ${s.descriptionEn}`;
          details += ` | Camera: ${s.cameraMovementEn} | Duration: ${s.duration}`;
          return details;
        }).join('\n');

      zhTemplate = `根据[${currentBaseZh}]，生成一张具有凝聚力的[3x3]网格图像，包含在同一环境中的[9]个不同摄像机镜头，严格保持人物/物体、服装和光线的一致性，[8K]分辨率，[16:9]画幅。重要提示：请在每个网格画面的右上角清晰地叠加对应的数字编号（1到9）。\n\n` +
        shots.map((s, i) => {
          const shotType = SHOT_TYPES.find(t => t.en === s.type || t.label.includes(s.type));
          let details = `镜头 ${String(i + 1).padStart(2, '0')}：${shotType?.label || s.type}`;
          if (s.charactersZh) details += ` | 角色: ${s.charactersZh}`;
          if (s.sceneZh) details += ` | 场景: ${s.sceneZh}`;
          if (s.descriptionZh) details += ` - ${s.descriptionZh}`;
          details += ` | 运镜: ${s.cameraMovementZh} | 时长: ${s.duration}`;
          return details;
        }).join('\n');
    }

    setFinalPrompt({ zh: zhTemplate, en: enTemplate });
  }, [basePrompt, shots, outputMode, activeTab]);

  useEffect(() => {
    generateFinalPrompt();
  }, [generateFinalPrompt]);

  const copyToClipboard = () => {
    const text = lang === 'en' ? finalPrompt.en : finalPrompt.zh;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-zinc-900 to-zinc-700 rounded-xl flex items-center justify-center text-white shadow-lg shadow-zinc-200 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20"></div>
            <LayoutGrid size={20} className="relative z-10" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900 flex items-center gap-2">
              Jason的专属分镜工作台
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-widest border border-amber-200">
                PRO
              </span>
            </h1>
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider hidden sm:block">Jason's Exclusive Workspace</p>
          </div>
        </div>

        <div className="hidden md:flex bg-zinc-100 p-1 rounded-lg border border-zinc-200/50">
          <button 
            onClick={() => setActiveTab('storyboard')} 
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all", activeTab === 'storyboard' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700")}
          >
            {lang === 'en' ? 'Storyboard' : '分镜生成'}
          </button>
          <button 
            onClick={() => setActiveTab('splitter')} 
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all", activeTab === 'splitter' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700")}
          >
            {lang === 'en' ? 'Image Splitter' : '九宫格拆分'}
          </button>
          <button 
            onClick={() => setActiveTab('script')} 
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all", activeTab === 'script' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700")}
          >
            {lang === 'en' ? 'Script Gen' : '脚本生成'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 transition-colors text-sm font-medium border border-zinc-200"
          >
            <Languages size={16} className="text-zinc-600" />
            {lang === 'en' ? 'EN' : '中'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Mobile Tabs */}
        <div className="flex md:hidden bg-zinc-100 p-1 rounded-lg mb-6">
          <button 
            onClick={() => setActiveTab('storyboard')} 
            className={cn("flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all", activeTab === 'storyboard' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700")}
          >
            {lang === 'en' ? 'Storyboard' : '分镜'}
          </button>
          <button 
            onClick={() => setActiveTab('splitter')} 
            className={cn("flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all", activeTab === 'splitter' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700")}
          >
            {lang === 'en' ? 'Splitter' : '拆分'}
          </button>
          <button 
            onClick={() => setActiveTab('script')} 
            className={cn("flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all", activeTab === 'script' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700")}
          >
            {lang === 'en' ? 'Script' : '脚本'}
          </button>
        </div>

        {activeTab === 'splitter' ? (
          <ImageSplitter lang={lang} onAnalyze={handleAnalyzeSplit} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column: Input & Analysis */}
            <div className="space-y-8">
          {/* Input Section */}
          <section className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm">
            {activeTab === 'storyboard' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <ImageIcon size={16} /> 01. Reference Images
                  </h2>
                  <span className="text-xs font-mono text-zinc-400">{images.length}/9</span>
                </div>
                
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-3",
                    isDragActive ? "border-indigo-500 bg-indigo-50" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                    <Upload size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">Click or drag images here</p>
                    <p className="text-xs text-zinc-400 mt-1">Supports JPG, PNG up to 5MB</p>
                  </div>
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-5 gap-3 mt-4">
                    <AnimatePresence>
                      {images.map((img, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 group"
                        >
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          <div className="absolute top-1 left-1 bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                            图{idx + 1}
                          </div>
                          <button 
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={12} />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}

            {activeTab === 'script' && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                    <Languages size={16} /> 01. Plot / Story
                  </h2>
                </div>
                <textarea
                  value={plot}
                  onChange={(e) => setPlot(e.target.value)}
                  placeholder={lang === 'en' ? "Enter your plot or story here..." : "在此输入您的剧情或故事..."}
                  className="w-full h-48 p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm leading-relaxed resize-none"
                />
              </>
            )}

            <div className="mt-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Languages size={16} /> 01.5 User Requirements
              </h2>
              <div className="space-y-2">
                <textarea
                  value={userRequirements}
                  onChange={(e) => setUserRequirements(e.target.value)}
                  placeholder="Describe specific requirements (e.g., 'Cyberpunk style', 'A chase scene', 'Warm sunset lighting')..."
                  className="w-full h-24 p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm leading-relaxed resize-none"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setUserRequirements(prev => prev ? `${prev} 将图1作为第一个画面` : '将图1作为第一个画面')}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 transition-colors border border-zinc-200"
                  >
                    {lang === 'en' ? '+ Use Image 1 as first frame' : '+ 将图1作为第一个画面'}
                  </button>
                  <button
                    onClick={() => setUserRequirements(prev => prev ? `${prev} 保持电影感光影` : '保持电影感光影')}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 transition-colors border border-zinc-200"
                  >
                    {lang === 'en' ? '+ Cinematic lighting' : '+ 保持电影感光影'}
                  </button>
                </div>
              </div>
            </div>

            {activeTab === 'storyboard' ? (
              <button
                onClick={handleAnalyze}
                disabled={images.length === 0 || isAnalyzing}
                className="w-full mt-6 bg-zinc-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black transition-all shadow-lg shadow-zinc-200"
              >
                {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                {isAnalyzing ? (lang === 'en' ? 'Analyzing Visuals (May take 1-2 mins)...' : '正在分析画面 (可能需要1-2分钟)...') : (lang === 'en' ? 'Analyze & Generate Base Prompt' : '分析并生成基础提示词')}
              </button>
            ) : (
              <button
                onClick={handleGenerateScript}
                disabled={!plot.trim() || isAnalyzing}
                className="w-full mt-6 bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                {isAnalyzing ? (lang === 'en' ? 'Generating Script...' : '正在生成脚本...') : (lang === 'en' ? 'Generate 15s Script' : '生成15秒脚本')}
              </button>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-start gap-2">
                <div className="mt-0.5 font-bold">!</div>
                <div>
                  <p className="font-semibold">{lang === 'en' ? 'Error' : '错误'}</p>
                  <p>{error}</p>
                </div>
              </div>
            )}
          </section>

          {/* Base Prompt Editor */}
          <section className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 mb-4">
              <Camera size={16} /> 02. Base Scene Description ({lang === 'en' ? 'EN' : 'ZH'})
            </h2>
            <textarea
              value={lang === 'en' ? basePrompt.en : basePrompt.zh}
              onChange={(e) => setBasePrompt(prev => ({ ...prev, [lang]: e.target.value }))}
              placeholder="The scene description will appear here after analysis..."
              className="w-full h-40 p-4 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm leading-relaxed resize-none"
            />
          </section>
        </div>

        {/* Right Column: Shot Config & Output */}
        <div className="space-y-8">
          {/* Shot Configuration */}
          <section className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 mb-6">
              <LayoutGrid size={16} /> 03. Shot Configuration ({lang === 'en' ? 'EN' : 'ZH'})
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shots.map((shot, idx) => (
                <div key={idx} className="p-3 rounded-xl border border-zinc-100 bg-zinc-50/50 space-y-2 relative">
                  <div className="absolute top-2 right-2 bg-indigo-100 text-indigo-700 text-[10px] font-black px-1.5 py-0.5 rounded-md font-mono">
                    #{idx + 1}
                  </div>
                  <div className="flex items-center justify-between pr-8">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase">Shot {idx + 1}</span>
                    <div className="relative group">
                      <select
                        value={shot.type}
                        onChange={(e) => updateShot(idx, 'type', e.target.value)}
                        className="appearance-none bg-transparent text-[11px] font-bold pr-4 outline-none cursor-pointer"
                      >
                        {SHOT_TYPES.map(t => (
                          <option key={t.id} value={t.en}>{t.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={10} className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400" />
                    </div>
                  </div>
                  <input 
                    type="text"
                    value={lang === 'en' ? shot.descriptionEn : shot.descriptionZh}
                    onChange={(e) => updateShot(idx, lang === 'en' ? 'descriptionEn' : 'descriptionZh', e.target.value)}
                    placeholder="Action/detail..."
                    className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1 text-[11px] outline-none focus:border-indigo-500"
                  />
                  {activeTab === 'script' && (
                    <>
                      <input 
                        type="text"
                        value={lang === 'en' ? shot.charactersEn : shot.charactersZh}
                        onChange={(e) => updateShot(idx, lang === 'en' ? 'charactersEn' : 'charactersZh', e.target.value)}
                        placeholder={lang === 'en' ? 'Characters...' : '出场角色...'}
                        className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1 text-[11px] outline-none focus:border-indigo-500"
                      />
                      <input 
                        type="text"
                        value={lang === 'en' ? shot.sceneEn : shot.sceneZh}
                        onChange={(e) => updateShot(idx, lang === 'en' ? 'sceneEn' : 'sceneZh', e.target.value)}
                        placeholder={lang === 'en' ? 'Scene/Setting...' : '场景...'}
                        className="w-full bg-white border border-zinc-200 rounded-lg px-2 py-1 text-[11px] outline-none focus:border-indigo-500"
                      />
                    </>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-2 py-1">
                      <Video size={12} className="text-zinc-400 shrink-0" />
                      <input 
                        type="text"
                        value={lang === 'en' ? shot.cameraMovementEn : shot.cameraMovementZh}
                        onChange={(e) => updateShot(idx, lang === 'en' ? 'cameraMovementEn' : 'cameraMovementZh', e.target.value)}
                        placeholder={lang === 'en' ? 'Camera...' : '运镜...'}
                        className="w-full bg-transparent text-[10px] outline-none"
                      />
                    </div>
                    <div className="w-16 flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-2 py-1">
                      <Clock size={12} className="text-zinc-400 shrink-0" />
                      <input 
                        type="text"
                        value={shot.duration}
                        onChange={(e) => updateShot(idx, 'duration', e.target.value)}
                        placeholder="3s"
                        className="w-full bg-transparent text-[10px] outline-none text-center"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Final Output */}
          <section className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full -mr-16 -mt-16" />
            
            <div className="flex items-center justify-between mb-4 relative z-10">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <Check size={16} /> 04. Final Prompt Output
              </h2>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-all text-xs font-medium border border-white/10"
              >
                {copied ? <Check size={14} className="text-indigo-400" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy Prompt'}
              </button>
            </div>

            <div className="bg-black/40 rounded-xl p-5 border border-white/5 min-h-[300px] relative z-10">
              <pre className="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                {lang === 'en' ? finalPrompt.en : finalPrompt.zh}
              </pre>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Ready for Midjourney / Stable Diffusion / Flux
            </div>
          </section>
        </div>
        </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-8 text-center text-zinc-400 text-xs border-t border-zinc-200 mt-12">
        <p>© 2026 Storyboard Prompt Pro • Powered by Gemini 3.0 Flash</p>
      </footer>
    </div>
  );
}
