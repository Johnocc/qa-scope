'use client';

import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'react-chartjs-2';
import type { DomainRate } from '@/lib/types/agent';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

/**
 * 본인 획득률 + 팀 평균 오버레이(점선). 팀 비교(team_rate)는 v1.2에서 제거됐다가
 * v1.4(2026-07-24)에서 "본인 vs 팀" 코칭 비교용으로 스파이더 오버레이만 재도입됐다
 * (계약 §3.3 — 순위·rank는 여전히 미도입). team_rate가 하나도 없으면(단일 상담사
 * 데이터 등) 팀 계열을 그리지 않고 기존과 동일하게 본인 선만 그린다.
 * rate/team_rate가 null인 영역은 0으로 그리지 않는다 — Chart.js는 null을 주면
 * 그 꼭짓점을 비워서 그린다(계약 §3.3 주석).
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
  // 팀 평균 오버레이: team_rate가 하나라도 있으면 두 번째 계열(점선)을 얹는다.
  const hasTeam = domainRates.some((d) => d.team_rate != null);

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
      // 팀 평균(본인·미배정 제외) — 점선·무채색으로 본인 선과 구분 (목업 --team-line #b7b2a0)
      ...(hasTeam
        ? [
            {
              label: '팀 평균(%)',
              data: domainRates.map((d) => d.team_rate),
              backgroundColor: 'rgba(183, 178, 160, 0.10)',
              borderColor: '#b7b2a0',
              pointBackgroundColor: '#b7b2a0',
              borderWidth: 2,
              borderDash: [5, 4],
            },
          ]
        : []),
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
        // 계열이 2개일 때만 범례 표시(본인·팀 구분). 본인 단독일 땐 기존처럼 숨김.
        plugins: { legend: { display: hasTeam, position: 'top' } },
      }}
    />
  );

  if (!compact) return chart;
  return <div className="relative h-full">{chart}</div>;
}
