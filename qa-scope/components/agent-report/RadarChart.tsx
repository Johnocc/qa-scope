'use client';

import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'react-chartjs-2';
import type { DomainRate } from '@/lib/types/agent';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

/**
 * 본인 값만 그린다 — 팀 비교(team_rate)는 v1.2에서 제거됐다 (계약 §1 결정 7,
 * 코칭 도구 철학). rate: null인 영역은 0으로 그리지 않는다 — Chart.js는
 * null을 주면 그 꼭짓점을 비워서 그린다(계약 §3.3 주석).
 */
/**
 * compact: 화면④ 요약 탭처럼 고정 높이 컨테이너 안에 축소해 넣을 때 true.
 * 기본값(false)에서는 기존 동작(= maintainAspectRatio 기본값 true)과 동일하다 —
 * PDF 캡처용 숨김 전체 레이아웃(page.tsx)이 이 컴포넌트를 인자 없이 그대로
 * 재사용하므로, 기본 동작은 절대 바뀌면 안 된다.
 */
export default function RadarChart({
  domainRates,
  compact = false,
}: {
  domainRates: DomainRate[];
  compact?: boolean;
}) {
  const data = {
    labels: domainRates.map((d) => `${d.domain_code}. ${d.domain_name}`),
    datasets: [
      {
        label: '본인 획득률(%)',
        data: domainRates.map((d) => d.rate),
        backgroundColor: 'rgba(168, 67, 60, 0.15)',
        borderColor: '#a8433c',
        pointBackgroundColor: '#a8433c',
        borderWidth: 2,
      },
    ],
  };

  const chart = (
    <Radar
      data={data}
      options={{
        maintainAspectRatio: !compact,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 20, backdropColor: 'transparent' },
            grid: { color: '#e7e2d3' },
            angleLines: { color: '#e7e2d3' },
            pointLabels: { color: '#26251f', font: { size: 12, weight: 600 } },
          },
        },
        plugins: { legend: { display: false } },
      }}
    />
  );

  if (!compact) return chart;
  return <div className="relative h-full">{chart}</div>;
}
