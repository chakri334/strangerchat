import { useState, useEffect } from 'react';
import { X, Play, Coins, Star, Gift, ChevronRight, Check, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { apiJSON } from '../utils/api';

/**
 * AdUnlockModal
 * Shown after a mutual wave. User watches a placeholder ad (or spends credits)
 * to unlock DM with the matched partner.
 *
 * Props:
 *   open          – boolean
 *   onClose       – () => void
 *   partnerName   – string
 *   partnerId     – string
 *   waveId        – string
 *   sessionToken  – string
 *   socket        – socket.io instance
 *   onUnlocked    – (partnerId) => void  called when DM is successfully unlocked
 */
const AdUnlockModal = ({ open, onClose, partnerName, partnerId, waveId, sessionToken, socket, onUnlocked }) => {
  const [step, setStep] = useState('intro');     // intro | watching | credits | success
  const [adProgress, setAdProgress] = useState(0);
  const [creditBalance, setCreditBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);

  // Fetch credit balance when modal opens
  useEffect(() => {
    if (!open || !sessionToken) return;
    setStep('intro');
    setAdProgress(0);
    apiJSON('/api/credits/balance', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    }).then(({ data }) => {
      if (data?.ok) setCreditBalance(data.balance);
    });
  }, [open, sessionToken]);

  // Listen for dm_unlocked socket event
  useEffect(() => {
    if (!socket) return;
    const onDmUnlocked = ({ partner_id, expires_at }) => {
      if (partner_id === partnerId) {
        setExpiresAt(expires_at);
        setStep('success');
        onUnlocked?.(partnerId);
      }
    };
    socket.on('dm_unlocked', onDmUnlocked);
    return () => socket.off('dm_unlocked', onDmUnlocked);
  }, [socket, partnerId, onUnlocked]);

  const handleWatchAd = () => {
    setStep('watching');
    setAdProgress(0);

    // Simulate ad playback — replace with real AdMob SDK call in production
    const interval = setInterval(() => {
      setAdProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          _claimAdReward();
          return 100;
        }
        return prev + 3.33; // ~30 seconds
      });
    }, 1000);
  };

  const _claimAdReward = async () => {
    try {
      // 1. Award ad credits
      await apiJSON('/api/credits/claim-ad-reward', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      // 2. Confirm DM unlock via socket
      socket?.emit('confirm_dm_unlock', {
        wave_id: waveId,
        partner_user_id: partnerId,
      });

      // Socket event dm_unlocked will set step → success
    } catch {
      toast.error('Something went wrong. Please try again.');
      setStep('intro');
    }
  };

  const handleSpendCredits = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const { data } = await apiJSON('/api/credits/unlock-dm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ target_user_id: partnerId }),
      });
      if (data?.ok) {
        setExpiresAt(data.expires_at);
        setStep('success');
        onUnlocked?.(partnerId);
        toast.success('DM unlocked with credits!');
      } else {
        toast.error(data?.message || 'Not enough credits.');
        setStep('credits');
      }
    } catch {
      toast.error('Failed to spend credits.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const formatExpiry = (iso) => {
    if (!iso) return '4 hours';
    const diff = new Date(iso) - new Date();
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0">
      <div className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#7c5cfc]/20 to-[#fc5c7d]/20 border-b border-slate-800 px-5 py-4">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-[#7c5cfc] to-[#fc5c7d] flex items-center justify-center text-xl shrink-0">
              🎉
            </div>
            <div>
              <h2 className="text-base font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
                Mutual Wave!
              </h2>
              <p className="text-[11px] text-slate-400">
                You and <span className="text-white font-semibold">{partnerName}</span> waved at each other
              </p>
            </div>
          </div>
        </div>

        {/* ── INTRO STEP ─────────────────────────────────────────────── */}
        {step === 'intro' && (
          <div className="px-5 py-5 space-y-4">
            <p className="text-sm text-slate-300 text-center">
              Unlock <span className="text-[#fc5c7d] font-semibold">Direct Message</span> with {partnerName} by watching a short ad or spending credits.
            </p>

            {/* Expiry info */}
            <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-3 py-2.5 flex items-center gap-2">
              <Lock size={13} className="text-[#fc5c7d] shrink-0" />
              <p className="text-[11px] text-slate-400">
                DM expires <span className="text-white font-semibold">4 hours</span> after unlock, or{' '}
                <span className="text-white font-semibold">2 hours</span> after first reply.
              </p>
            </div>

            {/* Ways to earn credits */}
            <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 px-3 py-3 space-y-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Ways to earn credits</p>
              {[
                { icon: <Play size={10} />, label: 'Watch an ad', credits: '+10', note: 'Up to 5×/day' },
                { icon: <Star size={10} />, label: 'Daily login', credits: '+5', note: 'Once every 24h' },
                { icon: <Gift size={10} />, label: 'Complete profile', credits: '+20', note: 'One-time' },
                { icon: <Coins size={10} />, label: 'Refer a friend', credits: '+50', note: 'Per signup' },
              ].map(({ icon, label, credits, note }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                    <span className="text-[#7c5cfc]">{icon}</span>{label}
                    <span className="text-slate-600">·</span>
                    <span className="text-[10px] text-slate-500">{note}</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-400">{credits}</span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <button
              onClick={handleWatchAd}
              className="w-full flex items-center justify-between rounded-xl bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white px-4 py-3 font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <Play size={15} />
                Watch a short ad
              </div>
              <div className="flex items-center gap-1 text-white/80 text-[11px]">
                Free <ChevronRight size={12} />
              </div>
            </button>

            <button
              onClick={() => setStep('credits')}
              className="w-full flex items-center justify-between rounded-xl bg-slate-800 border border-slate-700 text-slate-300 px-4 py-3 font-semibold text-sm hover:bg-slate-750 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Coins size={15} className="text-yellow-400" />
                Spend 30 credits
              </div>
              <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                {creditBalance !== null ? `${creditBalance} available` : '…'} <ChevronRight size={12} />
              </div>
            </button>
          </div>
        )}

        {/* ── WATCHING AD STEP ───────────────────────────────────────── */}
        {step === 'watching' && (
          <div className="px-5 py-8 flex flex-col items-center gap-5">
            {/* Placeholder ad screen */}
            <div className="w-full rounded-2xl bg-slate-800 border border-slate-700 aspect-video flex flex-col items-center justify-center gap-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[#7c5cfc]/10 to-[#fc5c7d]/10" />
              <span className="text-4xl">📺</span>
              <p className="text-sm font-bold text-white">Ad Playing…</p>
              <p className="text-[11px] text-slate-400 text-center px-4">
                In production this will show a real rewarded ad via AdMob.
              </p>
              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] transition-all duration-1000"
                  style={{ width: `${Math.min(adProgress, 100)}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              {adProgress < 100
                ? `Please wait… ${Math.ceil((100 - adProgress) / 3.33)}s remaining`
                : '✅ Ad complete! Unlocking DM…'}
            </p>
          </div>
        )}

        {/* ── CREDITS STEP ───────────────────────────────────────────── */}
        {step === 'credits' && (
          <div className="px-5 py-5 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-2">🪙</div>
              <p className="text-sm font-bold text-white">Your Credits</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                {creditBalance !== null ? creditBalance : '…'}
              </p>
            </div>

            {creditBalance !== null && creditBalance >= 30 ? (
              <>
                <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-3 py-2.5 text-center">
                  <p className="text-[11px] text-slate-400">
                    Spend <span className="text-yellow-400 font-bold">30 credits</span> to unlock DM with{' '}
                    <span className="text-white font-semibold">{partnerName}</span>
                  </p>
                </div>
                <button
                  onClick={handleSpendCredits}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-yellow-500 text-slate-900 px-4 py-3 font-bold text-sm hover:bg-yellow-400 transition-colors disabled:opacity-60"
                >
                  <Coins size={15} />
                  {loading ? 'Unlocking…' : 'Spend 30 Credits'}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-3 py-2.5 text-center">
                  <p className="text-[11px] text-slate-400">
                    You need <span className="text-yellow-400 font-bold">30 credits</span> to unlock DM.{' '}
                    You have <span className="text-white font-bold">{creditBalance ?? 0}</span>.
                  </p>
                </div>
                <button
                  onClick={() => setStep('intro')}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white px-4 py-3 font-bold text-sm"
                >
                  <Play size={15} />
                  Watch an ad to earn credits
                </button>
              </div>
            )}

            <button onClick={() => setStep('intro')} className="w-full text-[11px] text-slate-500 hover:text-slate-300 py-1">
              ← Back
            </button>
          </div>
        )}

        {/* ── SUCCESS STEP ───────────────────────────────────────────── */}
        {step === 'success' && (
          <div className="px-5 py-8 flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Check size={28} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-base font-bold text-white">DM Unlocked! 🎉</p>
              <p className="text-[11px] text-slate-400 mt-1">
                You can now message <span className="text-white font-semibold">{partnerName}</span> directly.
              </p>
            </div>
            <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">
                ⏱ Expires in{' '}
                <span className="text-white font-semibold">{formatExpiry(expiresAt)}</span>
                {' '}· 2h window starts after first reply
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-gradient-to-r from-[#7c5cfc] to-[#fc5c7d] text-white px-4 py-3 font-bold text-sm"
            >
              Start Chatting →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdUnlockModal;
