import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type EntityType = "team" | "league" | "division" | "tournament";

const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border cursor-pointer select-none";

export default function FollowButton({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: number;
}) {
  const { data: session } = authClient.useSession();
  const [following, setFollowing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session?.user || !entityId) return;
    fetch(`/api/me/follows/check?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => r.json())
      .then((d) => {
        setFollowing(!!d.following);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [session?.user, entityType, entityId]);

  if (!session?.user || !loaded) return null;

  const toggle = async () => {
    const next = !following;
    setFollowing(next); // optimistic

    try {
      if (next) {
        await fetch("/api/me/follows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId }),
        });
      } else {
        await fetch("/api/me/follows", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId }),
        });
      }
    } catch {
      setFollowing(!next); // revert on error
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        BTN_BASE,
        following
          ? "border-primary/40 text-primary hover:bg-primary/10"
          : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
      )}
      style={{ fontFamily: "var(--font-body)" }}
      title={following ? "Unfollow" : "Follow"}
    >
      <Star className={cn("h-3 w-3", following && "fill-current")} />
      {following ? "Following" : "Follow"}
    </button>
  );
}
