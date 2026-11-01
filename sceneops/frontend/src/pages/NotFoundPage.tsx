import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <EmptyState icon={<Compass />} title="הדף לא נמצא" description="הכתובת שביקשתם אינה קיימת במערכת."
      action={<Button asChild><Link to="/">חזרה למרכז השליטה</Link></Button>} />
  );
}
