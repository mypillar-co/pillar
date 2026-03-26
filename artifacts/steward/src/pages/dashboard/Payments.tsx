import React from "react";
import { DollarSign, TrendingUp, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Payments() {
  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Payments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Revenue and payment tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-white/10 bg-card/60">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground mb-2">Total Revenue</p>
            <p className="text-2xl font-bold text-white">$0.00</p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-card/60">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground mb-2">This Month</p>
            <p className="text-2xl font-bold text-white">$0.00</p>
            <p className="text-xs text-muted-foreground mt-1">Completed payments</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-card/60">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground mb-2">Pending</p>
            <p className="text-2xl font-bold text-white">$0.00</p>
            <p className="text-xs text-muted-foreground mt-1">Awaiting collection</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <DollarSign className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No payment records yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Payments will appear here as you collect vendor fees, ticket sales, and sponsorship payments.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Integrate Stripe for payment collection</p>
            <p className="text-xs text-muted-foreground mt-0.5">Accept payments from vendors, ticket buyers, and sponsors</p>
          </div>
          <Link href="/billing">
            <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 flex-shrink-0 ml-4">
              Manage billing <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
