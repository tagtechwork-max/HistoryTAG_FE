import { memo } from "react";

type ReportSectionSkeletonProps = {
  title: string;
  description: string;
  minHeight?: number;
};

export const ReportSectionSkeleton = memo(function ReportSectionSkeleton({
  title,
  description,
  minHeight = 160,
}: ReportSectionSkeletonProps) {
  return (
    <div style={{ minHeight }} aria-busy="true">
      <h2 className="text-lg font-semibold text-blue-800">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <div className="mt-5 h-3 w-2/3 animate-pulse rounded bg-gray-100" />
      <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-gray-100" />
    </div>
  );
});
