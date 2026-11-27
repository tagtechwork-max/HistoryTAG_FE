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
        <div className="sign-in-frame">
          <span className="sign-in-santa-hat" aria-hidden="true" />
          <SignInForm />
        </div>
      </main>
    </>
  );
}
