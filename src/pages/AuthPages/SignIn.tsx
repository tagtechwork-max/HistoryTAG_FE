import "./SignIn.css";
import PageMeta from "../../components/common/PageMeta";
import SignInForm from "../../components/auth/SignInForm";

const christmasLights = [
  // Garland bulbs at the top-left and top-right of noel.png.
  [1.8, 18.1],
  [5.2, 14.7],
  [7.3, 9.5],
  [12.6, 6.5],
  [18.1, 4.5],
  [22.4, 5.6],
  [26.5, 1.2],
  [78.2, 0.6],
  [82.2, 6.0],
  [85.2, 3.5],
  [89.4, 7.9],
  [94.4, 13.3],
  [98.6, 15.0],
  // Bulbs on the tree.
  [91, 48.8],
  [93.2, 53.8],
  [87.0, 61.1],
  [90.2, 63.2],
  [94.6, 62.4],
  [88.9, 69.2],
  [96.4, 75.3],
  [93.5, 77.2],
];

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Quản lý công việc | TAGTECH"
        description="Đăng nhập vào hệ thống quản lý công việc TAGTECH."
      />
      <main className="sign-in-page">
        <div className="sign-in-christmas-effects" aria-hidden="true">
          <div className="sign-in-christmas-image-map">
            <span className="sign-in-gift sign-in-gift-snowman-large" />
            <span className="sign-in-gift sign-in-gift-snowman-small" />
            <span className="sign-in-gift sign-in-gift-tree-left" />
            <span className="sign-in-gift sign-in-gift-tree-center" />
            <span className="sign-in-gift sign-in-gift-tree-right" />
            {christmasLights.map(([x, y], index) => (
              <span
                key={x}
                className="sign-in-christmas-light"
                style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${index * -0.37}s` }}
              />
            ))}
          </div>
        </div>
        <div className="sign-in-frame">
          <span className="sign-in-santa-hat" aria-hidden="true" />
          <SignInForm />
        </div>
      </main>
    </>
  );
}
