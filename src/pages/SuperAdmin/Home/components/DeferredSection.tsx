import { memo, useEffect, useRef, useState, type ReactNode } from "react";

type DeferredSectionProps = {
  id?: string;
  className?: string;
  rootMargin?: string;
  placeholder: ReactNode;
  children: ReactNode;
};

export const DeferredSection = memo(function DeferredSection({
  id,
  className,
  rootMargin = "500px 0px",
  placeholder,
  children,
}: DeferredSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);

  useEffect(() => {
    const target = sectionRef.current;
    if (!target || hasEnteredViewport) return;
    if (!("IntersectionObserver" in window)) {
      setHasEnteredViewport(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHasEnteredViewport(true);
        observer.disconnect();
      }
    }, { rootMargin });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasEnteredViewport, rootMargin]);

  return <section ref={sectionRef} id={id} className={className}>{hasEnteredViewport ? children : placeholder}</section>;
});
