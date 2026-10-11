#!/bin/bash

import_ecr_repository() {
  terraform_address="$1"
  repository_name="$2"

  if aws ecr describe-repositories --repository-names "$repository_name" >/dev/null 2>&1; then
    terraform import "$terraform_address" "$repository_name" 2>&1
  fi
}

import_ecr_repository aws_ecr_repository.frontend "m324/myapp-frontend"
import_ecr_repository aws_ecr_repository.backend "m324/myapp-backend"
