import { memo, Suspense } from "react";
import { lazyWithRetry } from "../../../../utils/lazyWithRetry";
import { DeferredSection } from "../components/DeferredSection";
import { ReportSectionSkeleton } from "../components/ReportSectionSkeleton";

const CSKHReport = lazyWithRetry("superadmin-cskh-report", () => import("../../../../components/reports/CSKHReport"));

const placeholder = (
  <ReportSectionSkeleton
    title="Báo cáo Chăm sóc Khách hàng"
    description="Báo cáo sẽ tự tải khi bạn cuộn tới khu vực này."
    minHeight={220}
  />
);

export const CSKHReportSection = memo(function CSKHReportSection() {
  return (
    <DeferredSection
      id="section-cskh-report"
      className="w-full rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      placeholder={placeholder}
    >
      <Suspense fallback={placeholder}>
        <CSKHReport />
      </Suspense>
    </DeferredSection>
  );
});
