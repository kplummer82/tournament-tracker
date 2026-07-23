import { GetServerSideProps } from "next";
import { getSessionForRequest } from "@/lib/auth/server";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminSuggestionsClient from "@/components/admin/AdminSuggestionsClient";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSessionForRequest(context.req);
  if (!session?.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: {} };
};

export default function AdminSuggestionsPage() {
  return (
    <AdminLayout activeTab="suggestions">
      <p className="text-muted-foreground mb-6">
        Review crowdsourced location suggestions. Approving a suggestion applies it to the
        directory; rejecting records a note the submitter can see.
      </p>
      <AdminSuggestionsClient />
    </AdminLayout>
  );
}
