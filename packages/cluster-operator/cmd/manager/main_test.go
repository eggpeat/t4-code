package main

import (
	"testing"
	"time"
)

func TestManagerUsesLeaseLeaderElection(t *testing.T) {
	options := managerOptions()
	if !options.LeaderElection {
		t.Fatal("controller manager must enable leader election")
	}
	if options.LeaderElectionResourceLock != "leases" {
		t.Fatalf("leader-election resource lock = %q, want leases", options.LeaderElectionResourceLock)
	}
	if options.LeaderElectionID != "t4-cluster-operator.cluster.t4.dev" {
		t.Fatalf("leader-election ID = %q", options.LeaderElectionID)
	}
	if options.LeaseDuration == nil || options.RenewDeadline == nil || options.RetryPeriod == nil {
		t.Fatal("leader election timing must be explicit")
	}
	if *options.LeaseDuration < 15*time.Second || *options.RenewDeadline >= *options.LeaseDuration || *options.RetryPeriod >= *options.RenewDeadline {
		t.Fatalf("unsafe leader-election timing: lease=%v renew=%v retry=%v", *options.LeaseDuration, *options.RenewDeadline, *options.RetryPeriod)
	}
}
