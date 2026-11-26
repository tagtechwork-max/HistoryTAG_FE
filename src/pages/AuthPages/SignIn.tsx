import "./SignIn.css";
import PageMeta from "../../components/common/PageMeta";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Quản lý công việc | TAGTECH"
        description="Đăng nhập vào hệ thống quản lý công việc TAGTECH."
      />
      <main className="sign-in-page">
        <div className="sign-in-contours" aria-hidden="true" />
        <svg
          className="sign-in-waves"
          viewBox="0 0 1600 500"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id="sign-in-wave-color" x1="0" y1="1" x2="1" y2="0">
              <stop stopColor="#233FF7" />
              <stop offset=".45" stopColor="#81bcff" />
              <stop offset=".78" stopColor="#20d9ed" />
              <stop offset="1" stopColor="#1687f4" />
            </linearGradient>
            <linearGradient id="sign-in-wave-overlay" x1="0" y1="0" x2="1" y2=".5">
              <stop stopColor="#1649ed" stopOpacity=".65" />
              <stop offset=".5" stopColor="#b8e4ff" stopOpacity=".12" />
              <stop offset="1" stopColor="#1351f8" stopOpacity=".9" />
            </linearGradient>
          </defs>
          <path d="M0 332C269 329 436 497 702 481C1127 457 1324 51 1600 2V500H0Z" fill="#c9e3fc" fillOpacity=".58" />
          <path d="M0 332C269 329 436 497 702 481C1127 457 1324 51 1600 2" fill="none" stroke="white" strokeOpacity=".7" strokeWidth="2" />
          <path d="M0 357C296 368 430 528 758 497C1219 453 1286 166 1600 135V500H0Z" fill="url(#sign-in-wave-color)" />
          <path d="M0 386C276 380 479 529 783 507C1242 474 1328 201 1600 184V500H0Z" fill="url(#sign-in-wave-overlay)" />
          <path d="M0 439C235 369 400 463 519 500M1034 500C1240 377 1430 308 1600 333" fill="none" stroke="#dbf7ff" strokeOpacity=".76" strokeWidth="2.5" />
        </svg>
        <SignInForm />
      </main>
    </>
  );
}
