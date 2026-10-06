import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <SignIn fallbackRedirectUrl="/" signUpUrl="/sign-up" />
    </div>
  );
}
