import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    webpush.setVapidDetails(
      "mailto:contact@educanjou.fr",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const today = new Date().toISOString().slice(0, 10);

    const { data: fiches, error: fichesError } = await supabase
      .from("fiches")
      .select("id")
      .lte("date_rappel", today)
      .not("date_rappel", "is", null);

    if (fichesError) throw fichesError;

    const count = (fiches || []).length;

    const { data: subs, error: subsError } = await supabase.from("push_subscriptions").select("*");
    if (subsError) throw subsError;

    if (!subs || subs.length === 0) {
      return res.status(200).json({ sent: 0, message: "Aucun abonnement aux notifications." });
    }

    const payload = JSON.stringify({
      title: "Éduc'Anjou - Suivi clients",
      body:
        count > 0
          ? `${count} fiche${count > 1 ? "s" : ""} à relancer aujourd'hui.`
          : "Rien à relancer aujourd'hui. 🎉",
      url: "/",
    });

    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(s.subscription, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }

    return res.status(200).json({ sent, aFaire: count });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
