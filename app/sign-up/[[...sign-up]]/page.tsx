import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <SignUp fallbackRedirectUrl="/" signInUrl="/sign-in" />
    </div>
  );
}
