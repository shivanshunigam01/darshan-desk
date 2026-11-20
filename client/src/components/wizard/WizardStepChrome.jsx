import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';

export function WizardStepChrome({ title, description, children }) {
  return (
    <Card className="border-[var(--dd-border)] shadow-[var(--dd-shadow-card)]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}