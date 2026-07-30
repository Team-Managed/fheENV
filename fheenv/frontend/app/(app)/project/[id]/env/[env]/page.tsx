import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string; env: string }> };

export default async function EnvironmentPage({ params }: Props) {
  const { id } = await params;
  redirect(`/project/${id}`);
}
