// AuthLayout.tsx
import React, { useEffect, useRef, useState } from "react";
import GridShape from "../../components/common/GridShape";
import { Link } from "react-router-dom";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const recalc = () => {
      const c = containerRef.current;
      const i = innerRef.current;
      if (!c || !i) return;

      // Căn giữa với padding nhỏ
      const padTop = 40;
      const padBottom = 40;
      const available = c.clientHeight - padTop - padBottom;
      const real = i.scrollHeight;

      // Scale để vừa với màn hình nhưng không quá nhỏ
      const desired = available / real;
      const s = Math.max(0.75, Math.min(1.0, desired));
      setScale(s);
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recalc);
    };
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden">
      <div className="flex h-full w-full">
        {/* LEFT */}
        <div
          ref={containerRef}
          className="relative flex flex-1 h-full text-white items-center justify-center bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/backlogin.png')" }}
        >
          <div className="absolute inset-0 bg-black/0" />
          <div className="w-full flex justify-center -mt-12">
            <div
              className="origin-center transition-transform duration-300 ease-out relative z-10"
              style={{
                transform: `scale(${scale})`,
                width: "100%",
                maxWidth: "450px",
                padding: "0 2rem",
              }}
            >
              <div ref={innerRef}>{children}</div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div
          className="
            relative hidden lg:flex h-full shrink-0
            items-center justify-center bg-white overflow-hidden
            w-[clamp(420px,38vw,520px)]
          "
        >
          <div className="absolute inset-0 pointer-events-none">
            <GridShape />
          </div>
          <Link to="/" className="relative z-10 block">
            <img
              src="/images/logo/logo.jpg"
              alt="Logo"
              className="w-full max-w-[340px] object-contain"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
