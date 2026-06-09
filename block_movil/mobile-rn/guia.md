PS W:\clinica\apps\mobile-rn> netstat -ano | findstr "5554 5555"                                 
  TCP    0.0.0.0:5555           0.0.0.0:0              LISTENING       25528
  TCP    [::]:5555              [::]:0                 LISTENING       25528
PS W:\clinica\apps\mobile-rn> tasklist /FI "PID eq 25528"         

Image Name                     PID Session Name        Session#    Mem Usage
========================= ======== ================ =========== ============
node.exe                     25528 Console                    1      8,988 K
PS W:\clinica\apps\mobile-rn> netstat -ano | findstr "5554 5555"
  TCP    0.0.0.0:5555           0.0.0.0:0              LISTENING       25528
  TCP    [::]:5555              [::]:0                 LISTENING       25528
PS W:\clinica\apps\mobile-rn> 