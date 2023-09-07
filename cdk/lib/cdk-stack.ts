import { Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // vpc
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('172.16.0.0/16'),
      natGateways: 1,
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        }
      ],
      // remove all rules from default security group
      // See: https://docs.aws.amazon.com/config/latest/developerguide/vpc-default-security-group-closed.html
      restrictDefaultSecurityGroup: true
    });

    // s3 bucket for mount
    const mountBucket = new s3.Bucket(this, 'MountBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    //
    // security groups
    //
    const ec2Sg = new ec2.SecurityGroup(this, 'Ec2Sg', {
      vpc,
      allowAllOutbound: true,
      description: 'security group for ec2'
    })

    //
    // roles
    //
    const s3Role = new iam.Role(this, 'S3Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonS3FullAccess"
        ),
      ],
      description: 'role for ec2 using s3',
    });

    //
    // ec2
    //
    const userData = ec2.UserData.forLinux({
      shebang: '#!/bin/bash',
    })
    userData.addCommands(
      // setup Mountpoint
      'wget https://s3.amazonaws.com/mountpoint-s3-release/latest/x86_64/mount-s3.rpm',
      'yum install -y ./mount-s3.rpm',

      'cd /home/ssm-user',
      'mkdir sample-dir',

      // TODO: mount s3
    )

    const ins = new ec2.Instance(this, 'Ec2', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      vpc,
      vpcSubnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }),
      securityGroup: ec2Sg,
      role: s3Role,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            encrypted: true
          }),
        },
      ],
      userData,
      ssmSessionPermissions: true,
      propagateTagsToVolumeOnCreation: true,
    });
  }
}
