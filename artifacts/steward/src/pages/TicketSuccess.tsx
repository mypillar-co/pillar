import React from "react";
import { useRoute } from "wouter";
import { CheckCircle2, Ticket, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function TicketSuccess() {
  const [, params] = useRoute("/events/:slug/tickets/success");
  const slug = params?.slug ?? "";

  return (
    <div className="min-h-screen bg-[hsl(224,30%,8%)] flex items-center justify-center px-4">
      <Card className="border-white/10 bg-card/60 max-w-md w-full">
        <CardContent className="py-10 text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Tickets Confirmed!</h1>
          <p className="text-muted-foreground mb-6">
            Your purchase was successful. You should receive a confirmation email shortly with your ticket details.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
            <Ticket className="w-4 h-4 text-primary" />
            <span>Keep your confirmation email for entry</span>
          </div>
          <Link href={`/events/${slug}/tickets`}>
            <Button variant="outline" className="border-white/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Event
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
