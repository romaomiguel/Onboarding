import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export const TabsList = ({ className, ...p }: React.ComponentProps<typeof T.List>) => (
  <T.List className={cn('inline-flex gap-1 rounded-lg bg-muted p-1', className)} {...p} />
);

export const TabsTrigger = ({ className, ...p }: React.ComponentProps<typeof T.Trigger>) => (
  <T.Trigger
    className={cn('rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors disabled:opacity-40 data-[state=active]:bg-card data-[state=active]:text-secondary data-[state=active]:shadow-sm', className)}
    {...p}
  />
);
