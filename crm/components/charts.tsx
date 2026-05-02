'use client';
/**
 * Recharts wrappers — client-only (Recharts dùng SVG + ResizeObserver).
 */
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const PRIMARY = '#d32f2f';
const SECONDARY = '#94a3b8';
const SUCCESS = '#10b981';

export type DailyAchievementPoint = {
  date: string;
  actual: number;
  target: number;
  achieved: number;     // 0 or 1
};

/**
 * Line chart: actual vs target subscribers theo ngày.
 */
export function DailyAchievementChart({ data }: { data: DailyAchievementPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="actual"
          name="Thực tế"
          stroke={PRIMARY}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="target"
          name="Target"
          stroke={SECONDARY}
          strokeDasharray="5 5"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export type SubmissionStatusBucket = {
  date: string;
  approved: number;
  rejected: number;
  needs_review: number;
};

/**
 * Stacked bar: số submission theo loại kết quả từng ngày.
 */
export function SubmissionStatusChart({ data }: { data: SubmissionStatusBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="approved" name="Đạt" stackId="a" fill={SUCCESS} />
        <Bar dataKey="rejected" name="Không đạt" stackId="a" fill={PRIMARY} />
        <Bar dataKey="needs_review" name="Cần xem" stackId="a" fill="#f59e0b" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export type BranchKpi = {
  branch: string;
  approved: number;
  total: number;
  rate: number;
};

export function BranchKpiChart({ data }: { data: BranchKpi[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis dataKey="branch" type="category" width={100} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="rate" name="Tỉ lệ đạt (%)" fill={PRIMARY} />
      </BarChart>
    </ResponsiveContainer>
  );
}
