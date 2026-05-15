import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Upload, X, Download, Grid3X3, Loader2, Image as ImageIcon, Trash2, Eye, RefreshCw, Layers, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ImageSplitterProps {
  lang: 'en' | 'zh';
  onAnalyze?: (images: string[]) => void;
}

interface SourceImage {
  id: string;
  file: File;
  preview: string;
}

interface SplitCell {
  index: number;
  dataUrl: string;
}

interface SplitGroup {
  id: string;
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  cells: SplitCell[];
}

export default function ImageSplitter({ lang, onAnalyze }: ImageSplitterProps) {
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([]);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file)
    }));
    setSourceImages(prev => [...prev, ...newImages]);
    setSplitGroups([]); // Reset splits when new images are added
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] }
  } as any);

  const removeSourceImage = (id: string) => {
    setSourceImages(prev => {
      const filtered = prev.filter(img => img.id !== id);
      const removed = prev.find(img => img.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return filtered;
    });
    setSplitGroups([]);
  };

  const clearAll = () => {
    sourceImages.forEach(img => URL.revokeObjectURL(img.preview));
    setSourceImages([]);
    setSplitGroups([]);
  };

  const handleSplit = async () => {
    if (sourceImages.length === 0) return;
    setIsProcessing(true);
    
    try {
      const newGroups: SplitGroup[] = [];
      
      for (const src of sourceImages) {
        const img = new Image();
        img.src = src.preview;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const cellW = img.width / cols;
        const cellH = img.height / rows;
        const cells: SplitCell[] = [];

        let count = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const canvas = document.createElement('canvas');
            canvas.width = cellW;
            canvas.height = cellH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, c * cellW, r * cellH, cellW, cellH, 0, 0, cellW, cellH);
              cells.push({
                index: count++,
                dataUrl: canvas.toDataURL('image/jpeg', 0.95)
              });
            }
          }
        }
        newGroups.push({ id: src.id, rows, cols, cellWidth: cellW, cellHeight: cellH, cells });
      }
      setSplitGroups(newGroups);
    } catch (error) {
      console.error("Error splitting images:", error);
      alert(lang === 'en' ? 'Error splitting images.' : '拆分图片时出错。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = async () => {
    if (splitGroups.length === 0) return;
    setIsZipping(true);
    
    try {
      const zip = new JSZip();
      
      splitGroups.forEach((group, gIdx) => {
        const folderName = splitGroups.length > 1 ? `grid_${gIdx + 1}` : '';
        group.cells.forEach((cell) => {
          const base64Data = cell.dataUrl.replace(/^data:image\/(png|jpeg);base64,/, "");
          const fileName = `split_${cell.index + 1}.jpg`;
          if (folderName) {
            zip.folder(folderName)?.file(fileName, base64Data, { base64: true });
          } else {
            zip.file(fileName, base64Data, { base64: true });
          }
        });
      });
      
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "split_images.zip");
    } catch (error) {
      console.error("Error creating zip:", error);
      alert(lang === 'en' ? 'Error creating ZIP file.' : '创建压缩包时出错。');
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadSingle = (dataUrl: string, index: number) => {
    saveAs(dataUrl, `split_${index + 1}.jpg`);
  };

  const handleReplace = (groupId: string, index: number, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const group = splitGroups.find(g => g.id === groupId);
      if (!group) return;

      const img = new Image();
      img.src = reader.result as string;
      await new Promise(r => img.onload = r);

      const canvas = document.createElement('canvas');
      canvas.width = group.cellWidth;
      canvas.height = group.cellHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Object-fit: cover logic to handle aspect ratio mismatches
      const imgRatio = img.width / img.height;
      const targetRatio = group.cellWidth / group.cellHeight;

      let sx, sy, sw, sh;
      if (imgRatio > targetRatio) {
        sh = img.height;
        sw = img.height * targetRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
      } else {
        sw = img.width;
        sh = img.width / targetRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, group.cellWidth, group.cellHeight);
      const newDataUrl = canvas.toDataURL('image/jpeg', 0.95);

      setSplitGroups(prev => prev.map(g => {
        if (g.id === groupId) {
          const newCells = [...g.cells];
          const cellIdx = newCells.findIndex(c => c.index === index);
          if (cellIdx !== -1) {
            newCells[cellIdx] = { ...newCells[cellIdx], dataUrl: newDataUrl };
          }
          return { ...g, cells: newCells };
        }
        return g;
      }));
    };
    reader.readAsDataURL(file);
  };

  const triggerReplace = (groupId: string, index: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleReplace(groupId, index, file);
    };
    input.click();
  };

  const handleMerge = async (groupId: string) => {
    const group = splitGroups.find(g => g.id === groupId);
    if (!group) return;

    const canvas = document.createElement('canvas');
    canvas.width = group.cols * group.cellWidth;
    canvas.height = group.rows * group.cellHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    await Promise.all(group.cells.map(cell => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.src = cell.dataUrl;
        img.onload = () => {
          const r = Math.floor(cell.index / group.cols);
          const c = cell.index % group.cols;
          ctx.drawImage(img, c * group.cellWidth, r * group.cellHeight, group.cellWidth, group.cellHeight);
          resolve();
        };
      });
    }));

    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `merged_grid.jpg`);
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="space-y-8">
      {/* Controls & Upload */}
      <section className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left: Upload Area */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <ImageIcon size={16} /> {lang === 'en' ? '01. Upload Grids' : '01. 上传拼图'}
              </h2>
              {sourceImages.length > 0 && (
                <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1">
                  <Trash2 size={14} /> {lang === 'en' ? 'Clear All' : '清空全部'}
                </button>
              )}
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
                <p className="text-sm font-semibold">{lang === 'en' ? 'Click or drag images here' : '点击或拖拽图片到此处'}</p>
                <p className="text-xs text-zinc-400 mt-1">{lang === 'en' ? 'Batch upload supported' : '支持批量上传'}</p>
              </div>
            </div>

            {sourceImages.length > 0 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 mt-4">
                <AnimatePresence>
                  {sourceImages.map((img) => (
                    <motion.div 
                      key={img.id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 group"
                    >
                      <img src={img.preview} alt="" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removeSourceImage(img.id)}
                        className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Right: Settings & Actions */}
          <div className="w-full md:w-72 space-y-6">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2 mb-4">
                <Grid3X3 size={16} /> {lang === 'en' ? '02. Grid Settings' : '02. 拆分设置'}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">{lang === 'en' ? 'Rows' : '行数'}</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="10" 
                    value={rows} 
                    onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">{lang === 'en' ? 'Columns' : '列数'}</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="10" 
                    value={cols} 
                    onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleSplit}
                disabled={sourceImages.length === 0 || isProcessing}
                className="w-full bg-zinc-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black transition-all shadow-lg shadow-zinc-200"
              >
                {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Grid3X3 size={18} />}
                {lang === 'en' ? 'Split Images' : '开始拆分'}
              </button>

              <button
                onClick={handleDownloadZip}
                disabled={splitGroups.length === 0 || isZipping}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                {isZipping ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                {lang === 'en' ? 'Download ZIP' : '打包下载 (ZIP)'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Preview Area */}
      {splitGroups.length > 0 && (
        <div className="space-y-6">
          {splitGroups.map((group, gIdx) => (
            <section key={group.id} className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                  <ImageIcon size={16} /> {lang === 'en' ? `Grid ${gIdx + 1} Results` : `拼图 ${gIdx + 1} 结果`}
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded-md">
                    {group.cells.length} {lang === 'en' ? 'images' : '张图片'}
                  </span>
                  {onAnalyze && (
                    <button
                      onClick={() => onAnalyze(group.cells.map(c => c.dataUrl))}
                      className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Sparkles size={14} />
                      {lang === 'en' ? 'AI Analyze' : 'AI分析分镜'}
                    </button>
                  )}
                  <button
                    onClick={() => handleMerge(group.id)}
                    className="text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-black transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Layers size={14} />
                    {lang === 'en' ? 'Merge Back' : '重新合成'}
                  </button>
                </div>
              </div>
              
              <div 
                className="grid gap-4" 
                style={{ gridTemplateColumns: `repeat(${group.cols}, minmax(0, 1fr))` }}
              >
                {group.cells.map((cell) => (
                  <div key={cell.index} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50 group/cell">
                    <img src={cell.dataUrl} alt={`Split ${cell.index}`} className="w-full h-full object-cover" />
                    
                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/cell:opacity-100 transition-opacity flex flex-wrap content-center justify-center gap-2 p-2">
                      <button 
                        onClick={() => setPreviewImage(cell.dataUrl)}
                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
                        title={lang === 'en' ? 'Preview' : '预览'}
                      >
                        <Eye size={14} />
                      </button>
                      <button 
                        onClick={() => triggerReplace(group.id, cell.index)}
                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
                        title={lang === 'en' ? 'Replace' : '替换'}
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button 
                        onClick={() => handleDownloadSingle(cell.dataUrl, cell.index)}
                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white backdrop-blur-sm transition-colors"
                        title={lang === 'en' ? 'Download' : '下载'}
                      >
                        <Download size={14} />
                      </button>
                    </div>

                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 pointer-events-none">
                      <span className="text-[10px] text-white font-medium">{cell.index + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Fullscreen Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
            onClick={() => setPreviewImage(null)}
          >
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <X size={20} />
            </button>
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={previewImage} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
