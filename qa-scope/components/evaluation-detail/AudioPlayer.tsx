/**
 * components/evaluation-detail/AudioPlayer.tsx — 상담 녹음 재생.
 * audio_url이 없으면 아무것도 렌더링하지 않는다(placeholder·안내문구 없음).
 */
export default function AudioPlayer({ audioUrl }: { audioUrl: string | null | undefined }) {
  if (!audioUrl) return null;

  return (
    <div className="border-b border-border-subtle p-4">
      <audio id="consultation-audio" controls src={audioUrl} className="w-full" />
    </div>
  );
}
