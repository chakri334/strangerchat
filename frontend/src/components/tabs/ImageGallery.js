import { useRef, useState } from 'react';
import { Plus, X, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, apiJSON } from '../../utils/api';

const MAX_IMAGES = 5;

const ImageGallery = ({ images, onChange }) => {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const filled = images.length;
  const slots = Array.from({ length: MAX_IMAGES });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast.error('JPEG, PNG, WebP or GIF only');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image too large (max 2 MB)');
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch('/api/profile/images', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok || !data.ok) {
      toast.error(data.message || 'Upload failed');
      return;
    }
    onChange(data.images);
    toast.success('Image added');
  };

  const handleRemove = async (idx) => {
    const { ok, data } = await apiJSON(`/api/profile/images/${idx}`, { method: 'DELETE' });
    if (ok && data?.ok) {
      onChange(data.images);
    }
  };

  return (
    <div className="space-y-2" data-testid="image-gallery">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Gallery · {filled}/{MAX_IMAGES}
        </label>
        {uploading && <span className="text-[10px] text-emerald-400 animate-pulse">Uploading…</span>}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {slots.map((_, idx) => {
          const img = images[idx];
          if (img) {
            return (
              <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-800" data-testid={`gallery-slot-${idx}`}>
                <img src={img} alt={`Gallery ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`gallery-remove-${idx}`}
                  aria-label="Remove image"
                >
                  <X size={10} />
                </button>
              </div>
            );
          }
          if (idx === filled) {
            return (
              <button
                key={idx}
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || filled >= MAX_IMAGES}
                className="aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-emerald-500 hover:bg-emerald-500/5 flex flex-col items-center justify-center text-slate-500 hover:text-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="gallery-add-btn"
              >
                <Plus size={16} />
                <Camera size={10} className="mt-0.5" />
              </button>
            );
          }
          return (
            <div key={idx} className="aspect-square rounded-xl border border-slate-800 bg-slate-900/40" />
          );
        })}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleUpload}
        className="hidden"
        data-testid="gallery-file-input"
      />
    </div>
  );
};

export default ImageGallery;
