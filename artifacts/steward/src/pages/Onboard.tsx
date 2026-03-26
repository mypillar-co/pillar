import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetOrganization, useCreateOrganization } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { toast } from "sonner";

const formSchema = z.object({
  name: z.string().min(2, "Organization name is required"),
  type: z.string().min(1, "Please select an organization type"),
  category: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const ORG_TYPES = [
  "Masonic Lodge",
  "Civic Organization",
  "Social Club",
  "Fraternal Organization",
  "Local Business",
  "Other"
];

export default function Onboard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useGetOrganization({
    query: { enabled: isAuthenticated }
  });
  
  const { mutate: createOrg, isPending } = useCreateOrganization();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    } else if (!orgLoading && orgData?.organization) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, authLoading, orgData, orgLoading, setLocation]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = (data: FormData) => {
    createOrg({ data }, {
      onSuccess: () => {
        toast.success("Organization created successfully");
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast.error("Failed to create organization. Please try again.");
      }
    });
  };

  if (authLoading || orgLoading || orgData?.organization) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border-white/10 shadow-2xl bg-card/80 backdrop-blur-xl">
          <CardHeader className="text-center pb-8">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-3xl mb-2">Welcome to Steward</CardTitle>
            <CardDescription className="text-base">
              Let's set up your organization's digital home. You can always change this later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Organization Name</label>
                <input
                  {...register("name")}
                  className="w-full h-12 px-4 rounded-xl bg-background border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="e.g. Washington Lodge No. 42"
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Organization Type</label>
                <select
                  {...register("type")}
                  className="w-full h-12 px-4 rounded-xl bg-background border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all appearance-none"
                >
                  <option value="" className="bg-background text-muted-foreground">Select a type...</option>
                  {ORG_TYPES.map(type => (
                    <option key={type} value={type} className="bg-background">{type}</option>
                  ))}
                </select>
                {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Category / Tagline (Optional)</label>
                <input
                  {...register("category")}
                  className="w-full h-12 px-4 rounded-xl bg-background border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="e.g. Making good men better"
                />
              </div>

              <Button type="submit" className="w-full h-12 text-base mt-4" disabled={isPending}>
                {isPending ? "Setting up..." : "Complete Setup"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
