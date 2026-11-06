// SPDX-License-Identifier: GPL-3.0-or-later
package firewall

import (
	"os"
	"testing"
)

// Writes the rendered pf/nft rules to files when NC_DUMP_RULES is set (manual syntax checks).
func TestDumpRules(t *testing.T) {
	dir := os.Getenv("NC_DUMP_RULES")
	if dir == "" {
		t.Skip("set NC_DUMP_RULES=<dir> to dump rules")
	}
	_ = os.WriteFile(dir+"/pf.conf", []byte(PFRules(plan(t))), 0o644)
	_ = os.WriteFile(dir+"/nft.conf", []byte(NFTRules(plan(t))), 0o644)
	script, _ := WindowsScript(plan(t))
	_ = os.WriteFile(dir+"/windows.ps1", []byte(script), 0o644)
}
