import React, { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, type ClaudeInstallation } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Terminal, Package, Check, FolderOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClaudeVersionSelectorProps {
  /**
   * Currently selected Claude installation path
   */
  selectedPath?: string | null;
  /**
   * Callback when a Claude installation is selected
   */
  onSelect: (installation: ClaudeInstallation) => void;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Whether to show a save button (for settings page)
   */
  showSaveButton?: boolean;
  /**
   * Callback when save button is clicked
   */
  onSave?: () => void;
  /**
   * Whether the save operation is in progress
   */
  isSaving?: boolean;
}

/**
 * ClaudeVersionSelector component for selecting Claude Code installations
 * 
 * @example
 * <ClaudeVersionSelector
 *   selectedPath={currentPath}
 *   onSelect={(installation) => setSelectedInstallation(installation)}
 * />
 */
export const ClaudeVersionSelector: React.FC<ClaudeVersionSelectorProps> = ({
  selectedPath,
  onSelect,
  className,
  showSaveButton = false,
  onSave,
  isSaving = false,
}) => {
  const [installations, setInstallations] = useState<ClaudeInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstallation, setSelectedInstallation] = useState<ClaudeInstallation | null>(null);
  const [manualPath, setManualPath] = useState("");
  const [isValidatingManualPath, setIsValidatingManualPath] = useState(false);

  useEffect(() => {
    loadInstallations();
  }, []);

  useEffect(() => {
    // Update selected installation when selectedPath changes
    if (selectedPath && installations.length > 0) {
      const found = installations.find(i => i.path === selectedPath);
      if (found) {
        setSelectedInstallation(found);
      }
    }
  }, [selectedPath, installations]);

  const loadInstallations = async () => {
    try {
      setLoading(true);
      setError(null);
      const foundInstallations = await api.listClaudeInstallations();
      setInstallations(foundInstallations);
      
      // If we have a selected path, find and select it
      if (selectedPath) {
        const found = foundInstallations.find(i => i.path === selectedPath);
        if (found) {
          setSelectedInstallation(found);
        } else {
          // If selectedPath doesn't match any discovered installation, 
          // create a manual entry for it
          const manualInstallation: ClaudeInstallation = {
            path: selectedPath,
            version: undefined,
            source: "manual"
          };
          setInstallations(prev => [manualInstallation, ...prev]);
          setSelectedInstallation(manualInstallation);
        }
      } else if (foundInstallations.length > 0) {
        // Auto-select the first (best) installation
        setSelectedInstallation(foundInstallations[0]);
        onSelect(foundInstallations[0]);
      }
    } catch (err) {
      console.error("Failed to load Claude installations:", err);
      setError(err instanceof Error ? err.message : "Failed to load Claude installations");
      // Even if auto-discovery fails, we still allow manual selection
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (installation: ClaudeInstallation) => {
    setSelectedInstallation(installation);
    onSelect(installation);
  };

  const addManualInstallation = async (path: string) => {
    if (!path.trim()) return;

    setIsValidatingManualPath(true);
    try {
      // Validate the path by trying to set it (this will check if file exists and is executable)
      await api.setClaudeBinaryPath(path.trim());
      
      // If validation succeeds, create the installation object
      const manualInstallation: ClaudeInstallation = {
        path: path.trim(),
        version: undefined, // We could try to detect version here if needed
        source: "manual"
      };

      // Remove any existing manual installations with the same path to avoid duplicates
      setInstallations(prev => {
        const filtered = prev.filter(inst => inst.path !== path.trim());
        return [manualInstallation, ...filtered];
      });
      
      setSelectedInstallation(manualInstallation);
      onSelect(manualInstallation);
      setManualPath("");
    } catch (error) {
      console.error("Failed to validate manual path:", error);
      setError(error instanceof Error ? error.message : "Invalid Claude binary path");
    } finally {
      setIsValidatingManualPath(false);
    }
  };

  const handleBrowseFile = async () => {
    try {
      // Check if open function is available (we're in Tauri environment)
      if (typeof open !== 'function') {
        setError("File browser is only available in the desktop app");
        return;
      }

      const selected = await open({
        multiple: false,
        filters: [],
        title: 'Select Claude Binary'
      });
      
      if (selected && typeof selected === 'string') {
        await addManualInstallation(selected);
      }
    } catch (error) {
      console.error("Failed to select file:", error);
      setError("Failed to open file browser. Please use manual path input instead.");
    }
  };

  const handleManualPathSubmit = () => {
    addManualInstallation(manualPath);
  };

  const getSourceIcon = (source: string) => {
    if (source.includes("nvm")) return <Package className="w-4 h-4" />;
    if (source === "manual") return <Plus className="w-4 h-4" />;
    return <Terminal className="w-4 h-4" />;
  };

  const getSourceLabel = (source: string) => {
    if (source === "which") return "System PATH";
    if (source === "homebrew") return "Homebrew";
    if (source === "system") return "System";
    if (source.startsWith("nvm")) return source.replace("nvm ", "NVM ");
    if (source === "local-bin") return "Local bin";
    if (source === "claude-local") return "Claude local";
    if (source === "npm-global") return "NPM global";
    if (source === "yarn" || source === "yarn-global") return "Yarn";
    if (source === "bun") return "Bun";
    if (source === "manual") return "Manual Selection";
    return source;
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Auto-discovered installations */}
      {installations.length > 0 && (
        <div>
          <Label className="text-sm font-medium mb-3 block">
            {installations.some(i => i.source !== "manual") ? "Discovered Installations" : "Selected Installation"}
          </Label>
          <RadioGroup
            value={selectedInstallation?.path}
            onValueChange={(value: string) => {
              const installation = installations.find(i => i.path === value);
              if (installation) {
                handleSelect(installation);
              }
            }}
          >
            <div className="space-y-2">
              {installations.map((installation) => (
                <Card
                  key={installation.path}
                  className={cn(
                    "relative cursor-pointer transition-colors",
                    selectedInstallation?.path === installation.path
                      ? "border-primary"
                      : "hover:border-muted-foreground/50"
                  )}
                  onClick={() => handleSelect(installation)}
                >
                  <div className="flex items-start p-4">
                    <RadioGroupItem
                      value={installation.path}
                      id={installation.path}
                      className="mt-1"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getSourceIcon(installation.source)}
                        <span className="font-medium text-sm">
                          {getSourceLabel(installation.source)}
                        </span>
                        {installation.version && (
                          <Badge variant="secondary" className="text-xs">
                            v{installation.version}
                          </Badge>
                        )}
                        {selectedPath === installation.path && (
                          <Badge variant="default" className="text-xs">
                            <Check className="w-3 h-3 mr-1" />
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono break-all">
                        {installation.path}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Manual selection section */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          Manual Selection
        </Label>
        <p className="text-xs text-muted-foreground">
          Can't find Claude? Manually specify the path to your Claude binary.
        </p>
        
        {/* Manual path input */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter path to Claude binary (e.g., /usr/local/bin/claude)"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && manualPath.trim()) {
                e.preventDefault();
                handleManualPathSubmit();
              }
            }}
            className="flex-1 font-mono text-sm"
          />
          <Button
            variant="outline"
            onClick={handleManualPathSubmit}
            disabled={!manualPath.trim() || isValidatingManualPath}
            size="sm"
          >
            {isValidatingManualPath ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Use Path"
            )}
          </Button>
        </div>

        {/* File browser button */}
        <Button
          variant="outline"
          onClick={handleBrowseFile}
          className="w-full gap-2"
          size="sm"
        >
          <FolderOpen className="w-4 h-4" />
          Browse for Claude Binary...
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <Card className="p-3 border-destructive bg-destructive/5">
          <div className="text-sm text-destructive">{error}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="mt-2 h-auto p-0 text-xs text-muted-foreground hover:text-destructive"
          >
            Dismiss
          </Button>
        </Card>
      )}

      {/* No installations found message */}
      {installations.length === 0 && !loading && (
        <Card className="p-4">
          <div className="text-sm text-muted-foreground text-center">
            No Claude Code installations found automatically.
            <br />
            Please use the manual selection above.
          </div>
        </Card>
      )}

      {showSaveButton && onSave && (
        <div className="flex justify-end">
          <Button
            onClick={onSave}
            disabled={!selectedInstallation || isSaving}
            size="sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Selection"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}; 